const labelOptions = {
    fruit: ["Apple", "Lemon", "Grape", "Orange", "Blueberry"],
    animal: ["Frog", "Whale", "Panda", "Tiger", "Robin"],
};

const defaultSamples = [
    {
        id: "apple-left",
        proxyType: "fruit",
        proxyLabel: "Apple",
        colour: "#9b4d4d",
        action: "turn left",
    },
    {
        id: "lemon-straight",
        proxyType: "fruit",
        proxyLabel: "Lemon",
        colour: "#d1c96a",
        action: "go straight",
    },
    {
        id: "frog-straight",
        proxyType: "animal",
        proxyLabel: "Frog",
        colour: "#5f8f65",
        action: "go straight",
    },
    {
        id: "whale-right",
        proxyType: "animal",
        proxyLabel: "Whale",
        colour: "#526f93",
        action: "turn right",
    },
    {
        id: "panda-stop",
        proxyType: "animal",
        proxyLabel: "Panda",
        colour: "#363636",
        action: "stop",
    },
];

const storageKey = "knn-maze-colour-samples";

const form = document.querySelector("#sample-form");
const proxyTypeInputs = document.querySelectorAll("input[name='proxyType']");
const proxyLabelSelect = document.querySelector("#proxy-label");
const sampleColour = document.querySelector("#sample-colour");
const sampleAction = document.querySelector("#sample-action");
const sampleList = document.querySelector("#sample-list");
const testColour = document.querySelector("#test-colour");
const kValue = document.querySelector("#k-value");
const predictionResult = document.querySelector("#prediction-result");
const resetButton = document.querySelector("#reset-samples");

let samples = loadSamples();

function loadSamples() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
        return [...defaultSamples];
    }

    try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) {
            return parsed;
        }
    } catch (error) {
        console.warn("Could not load saved samples", error);
    }

    return [...defaultSamples];
}

function saveSamples() {
    localStorage.setItem(storageKey, JSON.stringify(samples));
}

function selectedProxyType() {
    return document.querySelector("input[name='proxyType']:checked").value;
}

function updateProxyLabels() {
    const type = selectedProxyType();
    proxyLabelSelect.innerHTML = "";

    labelOptions[type].forEach((label) => {
        const option = document.createElement("option");
        option.value = label;
        option.textContent = label;
        proxyLabelSelect.appendChild(option);
    });
}

function hexToRgb(hex) {
    const normalized = hex.replace("#", "");
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    };
}

function colourDistance(a, b) {
    const colourA = hexToRgb(a);
    const colourB = hexToRgb(b);
    return Math.sqrt(
        (colourA.r - colourB.r) ** 2
        + (colourA.g - colourB.g) ** 2
        + (colourA.b - colourB.b) ** 2
    );
}

function nearestSamples(colour, k) {
    return samples
        .map((sample) => ({
            ...sample,
            distance: colourDistance(colour, sample.colour),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, Math.min(k, samples.length));
}

function predictAction() {
    if (!samples.length) {
        predictionResult.textContent = "Add samples to get a prediction.";
        return;
    }

    const neighbours = nearestSamples(testColour.value, Number(kValue.value));
    const votes = new Map();

    neighbours.forEach((sample) => {
        const score = votes.get(sample.action) || 0;
        votes.set(sample.action, score + 1);
    });

    const [action] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    const neighbourText = neighbours
        .map((sample) => `${sample.proxyLabel}: ${Math.round(sample.distance)}`)
        .join(" / ");

    predictionResult.innerHTML = `
        <strong>${action}</strong>
        <span>K = ${neighbours.length}. Nearest samples by RGB distance: ${neighbourText}</span>
    `;
}

function renderSamples() {
    sampleList.innerHTML = "";

    samples.forEach((sample) => {
        const item = document.createElement("article");
        item.className = "sample-item";

        const swatch = document.createElement("span");
        swatch.className = "sample-swatch";
        swatch.style.backgroundColor = sample.colour;

        const meta = document.createElement("div");
        meta.className = "sample-meta";
        meta.innerHTML = `
            <strong>${sample.proxyLabel}</strong>
            <span>${sample.proxyType} proxy / ${sample.action}</span>
        `;

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-sample";
        deleteButton.type = "button";
        deleteButton.setAttribute("aria-label", `Delete ${sample.proxyLabel} sample`);
        deleteButton.textContent = "x";
        deleteButton.addEventListener("click", () => {
            samples = samples.filter((entry) => entry.id !== sample.id);
            saveSamples();
            renderSamples();
            predictAction();
        });

        item.append(swatch, meta, deleteButton);
        sampleList.appendChild(item);
    });
}

form.addEventListener("submit", (event) => {
    event.preventDefault();

    samples.unshift({
        id: `${Date.now()}-${proxyLabelSelect.value}`,
        proxyType: selectedProxyType(),
        proxyLabel: proxyLabelSelect.value,
        colour: sampleColour.value,
        action: sampleAction.value,
    });

    saveSamples();
    renderSamples();
    predictAction();
});

proxyTypeInputs.forEach((input) => {
    input.addEventListener("change", updateProxyLabels);
});

testColour.addEventListener("input", predictAction);
kValue.addEventListener("input", predictAction);

resetButton.addEventListener("click", () => {
    samples = [...defaultSamples];
    saveSamples();
    renderSamples();
    predictAction();
});

updateProxyLabels();
renderSamples();
predictAction();

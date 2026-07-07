const vertexShader = `
varying vec2 vUv;
uniform float uTime;
uniform float uEnableWaves;

void main() {
    vUv = uv;
    float time = uTime * 5.0;
    float waveFactor = uEnableWaves;
    vec3 transformed = position;

    transformed.x += sin(time + position.y) * 0.5 * waveFactor;
    transformed.y += cos(time + position.z) * 0.15 * waveFactor;
    transformed.z += sin(time + position.x) * waveFactor;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
uniform float uTime;
uniform sampler2D uTexture;

void main() {
    float time = uTime;
    vec2 pos = vUv;
    float r = texture2D(uTexture, pos + cos(time + pos.x) * 0.01).r;
    float g = texture2D(uTexture, pos + sin(time * 0.5 + pos.x) * 0.01).g;
    float b = texture2D(uTexture, pos - cos(time + pos.y) * 0.01).b;
    float a = texture2D(uTexture, pos).a;
    gl_FragColor = vec4(r, g, b, a);
}
`;

const charset = " .'`^\",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

function mapRange(value, start, stop, start2, stop2) {
    return ((value - start) / (stop - start)) * (stop2 - start2) + start2;
}

class AsciiFilter {
    constructor(renderer, { fontSize = 8, fontFamily = "IBM Plex Mono, Courier New, monospace" } = {}) {
        this.renderer = renderer;
        this.fontSize = fontSize;
        this.fontFamily = fontFamily;
        this.domElement = document.createElement("div");
        this.domElement.className = "ascii-rendered";

        this.pre = document.createElement("pre");
        this.domElement.appendChild(this.pre);

        this.canvas = document.createElement("canvas");
        this.canvas.style.display = "none";
        this.context = this.canvas.getContext("2d", { willReadFrequently: true });
        this.domElement.appendChild(this.canvas);
    }

    setSize(width, height) {
        this.width = Math.max(1, Math.floor(width));
        this.height = Math.max(1, Math.floor(height));
        this.renderer.setSize(this.width, this.height, false);
        this.reset();
    }

    reset() {
        this.context.font = `${this.fontSize}px ${this.fontFamily}`;
        const charWidth = Math.max(1, this.context.measureText("A").width);
        this.cols = Math.max(1, Math.floor(this.width / charWidth));
        this.rows = Math.max(1, Math.floor(this.height / this.fontSize));
        this.canvas.width = this.cols;
        this.canvas.height = this.rows;
        this.pre.style.fontFamily = this.fontFamily;
        this.pre.style.fontSize = `${this.fontSize}px`;
    }

    render(scene, camera) {
        this.renderer.render(scene, camera);
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.context.clearRect(0, 0, w, h);
        this.context.drawImage(this.renderer.domElement, 0, 0, w, h);
        this.pre.textContent = this.asciify(this.context, w, h);
    }

    asciify(ctx, width, height) {
        const imgData = ctx.getImageData(0, 0, width, height).data;
        let output = "";

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const i = x * 4 + y * 4 * width;
                const r = imgData[i];
                const g = imgData[i + 1];
                const b = imgData[i + 2];
                const a = imgData[i + 3];

                if (a === 0) {
                    output += " ";
                    continue;
                }

                const gray = (0.3 * r + 0.6 * g + 0.1 * b) / 255;
                const index = Math.floor(gray * (charset.length - 1));
                output += charset[index];
            }
            output += "\n";
        }

        return output;
    }

    dispose() {
        this.pre.textContent = "";
    }
}

class CanvasText {
    constructor(text, { fontSize = 190, fontFamily = "IBM Plex Mono, Courier New, monospace", color = "#f7f7f2" } = {}) {
        this.canvas = document.createElement("canvas");
        this.context = this.canvas.getContext("2d");
        this.text = text;
        this.fontSize = fontSize;
        this.fontFamily = fontFamily;
        this.color = color;
        this.font = `700 ${this.fontSize}px ${this.fontFamily}`;
    }

    resize() {
        this.context.font = this.font;
        const metrics = this.context.measureText(this.text);
        const textWidth = Math.ceil(metrics.width) + 36;
        const textHeight = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + 36;

        this.canvas.width = textWidth;
        this.canvas.height = textHeight;
    }

    render() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.fillStyle = this.color;
        this.context.font = this.font;
        this.context.textBaseline = "alphabetic";

        const metrics = this.context.measureText(this.text);
        const y = 18 + metrics.actualBoundingBoxAscent;
        this.context.fillText(this.text, 18, y);
    }
}

class AsciiTextScene {
    constructor(THREE, container, options = {}) {
        this.THREE = THREE;
        this.container = container;
        this.text = options.text || "COLOUR_ACTION";
        this.enableWaves = options.enableWaves !== false;
        this.asciiFontSize = options.asciiFontSize || 8;
        this.textFontSize = options.textFontSize || 190;
        this.planeBaseHeight = options.planeBaseHeight || 8;
        this.mouse = { x: 0.5, y: 0.5 };
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onResize = this.onResize.bind(this);
    }

    init() {
        const bounds = this.container.getBoundingClientRect();
        this.width = Math.max(1, bounds.width);
        this.height = Math.max(1, bounds.height);

        this.camera = new this.THREE.PerspectiveCamera(45, this.width / this.height, 1, 1000);
        this.camera.position.z = 30;

        this.scene = new this.THREE.Scene();
        this.setMesh();
        this.setRenderer();
        this.container.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("resize", this.onResize);
        this.animate();
    }

    setMesh() {
        this.textCanvas = new CanvasText(this.text, {
            fontSize: this.textFontSize,
            color: "#f7f7f2",
        });
        this.textCanvas.resize();
        this.textCanvas.render();

        this.texture = new this.THREE.CanvasTexture(this.textCanvas.canvas);
        this.texture.minFilter = this.THREE.NearestFilter;

        const aspect = this.textCanvas.canvas.width / this.textCanvas.canvas.height;
        const planeWidth = this.planeBaseHeight * aspect;
        const planeHeight = this.planeBaseHeight;

        this.geometry = new this.THREE.PlaneGeometry(planeWidth, planeHeight, 36, 36);
        this.material = new this.THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            transparent: true,
            uniforms: {
                uTime: { value: 0 },
                uTexture: { value: this.texture },
                uEnableWaves: { value: this.enableWaves ? 1 : 0 },
            },
        });

        this.mesh = new this.THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);
    }

    setRenderer() {
        this.renderer = new this.THREE.WebGLRenderer({ antialias: false, alpha: true });
        this.renderer.setPixelRatio(1);
        this.renderer.setClearColor(0x000000, 0);

        this.filter = new AsciiFilter(this.renderer, {
            fontSize: this.asciiFontSize,
        });

        this.container.appendChild(this.filter.domElement);
        this.setSize(this.width, this.height);
    }

    setSize(width, height) {
        this.width = Math.max(1, width);
        this.height = Math.max(1, height);
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.filter.setSize(this.width, this.height);
    }

    onPointerMove(event) {
        const bounds = this.container.getBoundingClientRect();
        this.mouse = {
            x: (event.clientX - bounds.left) / bounds.width,
            y: (event.clientY - bounds.top) / bounds.height,
        };
    }

    onResize() {
        const bounds = this.container.getBoundingClientRect();
        this.setSize(bounds.width, bounds.height);
    }

    animate() {
        this.frame = requestAnimationFrame(() => this.animate());
        this.render();
    }

    render() {
        const time = performance.now() * 0.001;
        this.textCanvas.render();
        this.texture.needsUpdate = true;
        this.material.uniforms.uTime.value = Math.sin(time);

        const targetX = mapRange(this.mouse.y, 0, 1, 0.46, -0.46);
        const targetY = mapRange(this.mouse.x, 0, 1, -0.5, 0.5);
        this.mesh.rotation.x += (targetX - this.mesh.rotation.x) * 0.05;
        this.mesh.rotation.y += (targetY - this.mesh.rotation.y) * 0.05;

        this.filter.render(this.scene, this.camera);
    }

    dispose() {
        cancelAnimationFrame(this.frame);
        this.container.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("resize", this.onResize);
        this.filter.dispose();
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
    }
}

function bootAsciiHero() {
    const container = document.querySelector("#ascii-text-hero");
    if (!container) return;

    try {
        if (!window.THREE) {
            throw new Error("Three.js was not loaded.");
        }

        const scene = new AsciiTextScene(THREE, container, {
            text: container.dataset.text || "COLOUR_ACTION",
            asciiFontSize: 9,
            textFontSize: 170,
            planeBaseHeight: 7.0,
            enableWaves: true,
        });

        scene.init();
        container.closest(".ascii-stage")?.classList.add("ascii-ready");
        window.addEventListener("pagehide", () => scene.dispose(), { once: true });
    } catch (error) {
        container.closest(".ascii-stage")?.classList.add("ascii-fallback-active");
    }
}

window.addEventListener("DOMContentLoaded", bootAsciiHero);

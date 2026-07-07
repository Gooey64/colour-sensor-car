// LEGO Education CS & AI kit ("Tech Element") hub protocol.
//
// Unlike SPIKE Prime/Robot Inventor (LWP3), this hardware exposes each
// physical hub (a "Single/Double Motor" hub or a "Color Sensor" hub) as its
// own BLE peripheral with a dedicated write characteristic and a dedicated
// notify characteristic, rather than one shared characteristic on one
// central hub with attachable ports. A hub's role and port count are
// determined at connect time from the GroupID reported in its info
// response, not from a HUB_ATTACHED_IO event stream.
//
// Message layout on the wire (both directions) is: a single command/message
// ID byte, followed by fields packed per a fixed struct format (little
// endian). Outgoing writes have no extra envelope. Incoming notifications
// are wrapped in one of two envelopes, keyed by the first byte:
//   INFO_RESPONSE (1)      -> fields per INFO_MESSAGE, sent once after INFO_REQUEST
//   DEVICE_NOTIFICATION(60)-> 2-byte length + a run of further sub-messages,
//                             each keyed by DEVICE_MESSAGE_MAP, sent on the
//                             feed-rate interval set via the 'feed' command

export const SERVICE_UUID = '0000fd02-0000-1000-8000-00805f9b34fb';
export const WRITE_UUID = '0000fd02-0001-1000-8000-00805f9b34fb';
export const NOTIFY_UUID = '0000fd02-0002-1000-8000-00805f9b34fb';

// Command/message IDs (from the hub's published constants table).
export const MessageId = {
  INFO_REQUEST: 0,
  INFO_RESPONSE: 1,
  ERROR_REPORT_REQUEST: 2,
  ERROR_REPORT_RESPONSE: 3,
  DEVICE_NOTIFICATION_REQUEST: 40,
  DEVICE_NOTIFICATION_RESPONSE: 41,
  DEVICE_NOTIFICATION: 60,
  LIGHT_COLOR_COMMAND: 110,
  BEEP_COMMAND: 112,
  STOP_SOUND_COMMAND: 114,
  MOTOR_RESET_RELATIVE_POSITION_COMMAND: 120,
  MOTOR_RUN_COMMAND: 122,
  MOTOR_RUN_FOR_DEGREES_COMMAND: 124,
  MOTOR_RUN_FOR_TIME_COMMAND: 126,
  MOTOR_RUN_TO_ABSOLUTE_POSITION_COMMAND: 128,
  MOTOR_RUN_TO_RELATIVE_POSITION_COMMAND: 130,
  MOTOR_SET_DUTY_CYCLE_COMMAND: 132,
  MOTOR_STOP_COMMAND: 138,
  MOTOR_SET_SPEED_COMMAND: 140,
  MOTOR_SET_END_STATE_COMMAND: 142,
  MOTOR_SET_ACCELERATION_COMMAND: 144,
};

// GroupID values reported in the info response. 512/513 are motor hubs
// (single/double motor); 514/515 are sensor hubs. LEGO doesn't document a
// canonical mapping beyond what the reference app checks, so anything else
// is treated as unrecognized.
export const MOTOR_GROUP_IDS = new Set([512, 513]);
export const SENSOR_GROUP_IDS = new Set([514, 515]);
export const DOUBLE_MOTOR_GROUP_ID = 513;

export const COLOR_INDEX_NAMES = {
  255: 'NONE',
  0: 'BLACK',
  1: 'MAGENTA',
  2: 'PURPLE',
  3: 'BLUE',
  4: 'AZURE',
  5: 'TURQUOISE',
  6: 'GREEN',
  7: 'YELLOW',
  8: 'ORANGE',
  9: 'RED',
  10: 'WHITE',
};

// Outgoing commands: [structFormat, messageId]. The ID is always the first
// packed field, matching the format's leading 'B'.
export const Command = {
  INFO_REQUEST: ['<B', MessageId.INFO_REQUEST],
  FEED: ['<BH', MessageId.DEVICE_NOTIFICATION_REQUEST],
  MOTOR_SPEED: ['<BBb', MessageId.MOTOR_SET_SPEED_COMMAND],
  MOTOR_RUN: ['<BBB', MessageId.MOTOR_RUN_COMMAND],
  MOTOR_STOP: ['<BB', MessageId.MOTOR_STOP_COMMAND],
  MOTOR_BRAKE: ['<BBb', MessageId.MOTOR_SET_END_STATE_COMMAND],
};

// Incoming DEVICE_NOTIFICATION sub-messages, keyed by their leading ID byte.
// [name, structFormat (includes the leading ID byte), fieldNames|null]
export const DEVICE_MESSAGE_MAP = {
  0x00: ['hub info', '<BBB', ['Battery', 'USB']],
  0x01: [
    'hub imu',
    '<BBBhhhhhhhhh',
    ['face up', 'yaw face', 'yaw', 'pitch', 'roll', 'Ax', 'Ay', 'Az', 'gyro_x', 'gyro_y', 'gyro_z'],
  ],
  0x03: ['hub tags', '<BBH', ['color', 'tag']],
  0x04: ['btn state', '<BB', null],
  0x0a: ['Motor', '<BBBHhbib', ['port', 'type', 'angle', 'power', 'speed', 'position', 'gesture']],
  0x0c: [
    'Color',
    '<BBBHHHHBB',
    ['color', 'reflection', 'red', 'green', 'blue', 'hue', 'saturation', 'value'],
  ],
  0x0f: ['Joystick', '<Bbbhh', ['leftStep', 'rightStep', 'leftAngle', 'rightAngle']],
  0x10: ['imu gesture', '<BB', null],
  0x11: ['motor gesture', '<BBB', null],
};

// Fixed sequence of fields inside an INFO_RESPONSE payload.
export const INFO_MESSAGE = [
  ['RPC', '<BBH', ['major', 'minor', 'build']],
  ['Firmware', '<BBH', ['major', 'minor', 'build']],
  ['Bootloader', '<BBH', ['major', 'minor', 'build']],
  ['MaxSize', '<H', null],
  ['GroupID', '<H', null],
];

const TYPE_SIZES = { B: 1, b: 1, H: 2, h: 2, I: 4, i: 4 };

function formatChars(fmt) {
  return fmt.replace('<', '').split('');
}

export function structSize(fmt) {
  return formatChars(fmt).reduce((sum, c) => sum + TYPE_SIZES[c], 0);
}

export function packStruct(fmt, values) {
  const chars = formatChars(fmt);
  const buf = new ArrayBuffer(structSize(fmt));
  const dv = new DataView(buf);
  let offset = 0;
  chars.forEach((c, i) => {
    const v = values[i];
    switch (c) {
      case 'B':
        dv.setUint8(offset, v);
        break;
      case 'b':
        dv.setInt8(offset, v);
        break;
      case 'H':
        dv.setUint16(offset, v, true);
        break;
      case 'h':
        dv.setInt16(offset, v, true);
        break;
      case 'I':
        dv.setUint32(offset, v, true);
        break;
      case 'i':
        dv.setInt32(offset, v, true);
        break;
      default:
        throw new Error(`Unsupported struct type '${c}'`);
    }
    offset += TYPE_SIZES[c];
  });
  return new Uint8Array(buf);
}

// Returns the decoded values as an array, in format order.
export function unpackStruct(fmt, bytes) {
  const chars = formatChars(fmt);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  return chars.map((c) => {
    let v;
    switch (c) {
      case 'B':
        v = dv.getUint8(offset);
        break;
      case 'b':
        v = dv.getInt8(offset);
        break;
      case 'H':
        v = dv.getUint16(offset, true);
        break;
      case 'h':
        v = dv.getInt16(offset, true);
        break;
      case 'I':
        v = dv.getUint32(offset, true);
        break;
      case 'i':
        v = dv.getInt32(offset, true);
        break;
      default:
        throw new Error(`Unsupported struct type '${c}'`);
    }
    offset += TYPE_SIZES[c];
    return v;
  });
}

export function buildCommand(command, args = []) {
  const [fmt, id] = command;
  return packStruct(fmt, [id, ...args]);
}

// Parses one INFO_RESPONSE payload (bytes *after* the envelope ID byte)
// into { RPC: {...}, Firmware: {...}, Bootloader: {...}, MaxSize, GroupID }.
export function parseInfoResponse(bytes) {
  const info = {};
  let offset = 0;
  for (const [name, fmt, keys] of INFO_MESSAGE) {
    const size = structSize(fmt);
    const values = unpackStruct(fmt, bytes.slice(offset, offset + size));
    info[name] = keys ? Object.fromEntries(keys.map((k, i) => [k, values[i]])) : values[0];
    offset += size;
  }
  return info;
}

// Parses one DEVICE_NOTIFICATION payload (bytes after the envelope ID +
// length) into a flat map, e.g. { Motor_1: {...}, Color: {...} }. Motor
// messages are suffixed with their own reported hardware port number so
// multiple motors on one hub don't collide.
export function parseDeviceMessages(bytes) {
  const messages = {};
  let offset = 0;
  while (offset < bytes.length) {
    const id = bytes[offset];
    const entry = DEVICE_MESSAGE_MAP[id];
    if (!entry) break; // unknown sub-message; can't know its size, stop.
    const [name, fmt, keys] = entry;
    const size = structSize(fmt);
    if (offset + size > bytes.length) break;
    const values = unpackStruct(fmt, bytes.slice(offset, offset + size)).slice(1); // drop the ID field
    if (keys) {
      const key = keys[0] === 'port' ? `${name}_${values[0]}` : name;
      messages[key] = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
    } else {
      messages[name] = values;
    }
    offset += size;
  }
  return messages;
}

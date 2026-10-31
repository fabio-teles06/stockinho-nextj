import test from "node:test";
import assert from "node:assert/strict";
import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, NotFoundException } from "@zxing/library";
import bwip from "bwip-js";
import { startCameraScanner, cameraErrorMessage, createCameraReader } from "../lib/stock/camera-scanner.ts";

test("scanner decodes EAN-13 and internal Code 128 labels from generated image pixels", () => {
  for (const [bcid, text] of [["ean13", "7891234567895"], ["code128", "STK:12345678-abcd"]]) {
    const [{ sbs }] = bwip.raw({ bcid, text });
    const width = sbs.reduce((sum, size) => sum + size * 3, 72);
    const height = 120;
    const pixels = new Uint8ClampedArray(width * height).fill(255);
    let x = 36;
    sbs.forEach((size, index) => {
      if (index % 2 === 0) {
        for (let y = 12; y < height - 12; y++) pixels.fill(0, y * width + x, y * width + x + size * 3);
      }
      x += size * 3;
    });
    const source = new RGBLuminanceSource(pixels, width, height);
    const result = createCameraReader().decodeBitmap(new BinaryBitmap(new HybridBinarizer(source)));
    assert.equal(result.getText(), text);
  }
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup() {
  const state = { trackStops: 0, readerStops: 0, results: [], errors: [], ready: 0 };
  const stream = { getTracks: () => [{ stop: () => state.trackStops++ }] };
  const video = { srcObject: null };
  const dependencies = {
    secureContext: true,
    mediaDevices: {
      getUserMedia: async (constraints) => {
        state.constraints = constraints;
        return stream;
      },
    },
    reader: {
      decodeFromStream: async (_stream, preview, callback) => {
        preview.srcObject = _stream;
        state.callback = callback;
        return { stop: () => state.readerStops++ };
      },
    },
  };
  const start = () => startCameraScanner(video, {
    onResult: (value) => state.results.push(value),
    onError: (message) => state.errors.push(message),
    onReady: () => state.ready++,
  }, dependencies);
  return { state, stream, video, dependencies, start };
}

test("camera requests rear-facing HD video and accepts only one result per session", async () => {
  const { state, video, start } = setup();
  start();
  await tick();
  assert.equal(state.constraints.audio, false);
  assert.deepEqual(state.constraints.video, {
    facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 },
  });
  assert.equal(state.ready, 1);
  state.callback(undefined, new NotFoundException());
  assert.equal(state.trackStops, 0);
  state.callback({ getText: () => "7891234567895" });
  state.callback({ getText: () => "7891234567895" });
  assert.deepEqual(state.results, ["7891234567895"]);
  assert.equal(state.trackStops, 1);
  assert.equal(state.readerStops, 1);
  assert.equal(video.srcObject, null);
});

test("closing while permission is pending releases the late stream without starting decoding", async () => {
  const { state, stream, dependencies, start } = setup();
  let grant;
  dependencies.mediaDevices.getUserMedia = () => new Promise((resolve) => { grant = resolve; });
  const stop = start();
  stop();
  grant(stream);
  await tick();
  assert.equal(state.trackStops, 1);
  assert.equal(state.callback, undefined);
  assert.equal(state.ready, 0);
  assert.deepEqual(state.errors, []);
});

test("closing while video initializes stops both the stream and late scanner controls", async () => {
  const { state, dependencies, start } = setup();
  let finish;
  dependencies.reader.decodeFromStream = () => new Promise((resolve) => { finish = resolve; });
  const stop = start();
  await tick();
  stop();
  assert.equal(state.trackStops, 1);
  finish({ stop: () => state.readerStops++ });
  await tick();
  assert.equal(state.readerStops, 1);
  assert.equal(state.ready, 0);
});

test("fatal decode failures stop the camera and report an error", async () => {
  const { state, start } = setup();
  start();
  await tick();
  state.callback(undefined, new Error("Canvas failed"));
  assert.equal(state.errors.length, 1);
  assert.equal(state.trackStops, 1);
  assert.equal(state.readerStops, 1);
});

test("video startup failures release the camera", async () => {
  const { state, dependencies, start } = setup();
  dependencies.reader.decodeFromStream = async () => { throw new Error("Playback failed"); };
  start();
  await tick();
  assert.equal(state.trackStops, 1);
  assert.equal(state.errors.length, 1);
});

test("insecure contexts and unavailable browser APIs explain why scanning cannot start", async () => {
  for (const secureContext of [false, true]) {
    const { state, dependencies, start } = setup();
    dependencies.secureContext = secureContext;
    dependencies.mediaDevices = undefined;
    start();
    await tick();
    assert.match(state.errors[0], secureContext ? /navegador/ : /HTTPS/);
    assert.equal(state.callback, undefined);
  }
});

test("camera errors distinguish blocked permissions, missing hardware, and a busy camera", async () => {
  assert.match(cameraErrorMessage({ name: "NotAllowedError" }), /Permita/);
  assert.match(cameraErrorMessage({ name: "NotFoundError" }), /Nenhuma câmera/);
  assert.match(cameraErrorMessage({ name: "NotReadableError" }), /outros aplicativos/);
  const { state, dependencies, start } = setup();
  dependencies.mediaDevices.getUserMedia = async () => { throw { name: "NotAllowedError" }; };
  start();
  await tick();
  assert.match(state.errors[0], /Permita/);
});

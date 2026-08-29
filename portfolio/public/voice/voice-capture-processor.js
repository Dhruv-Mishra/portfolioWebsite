const INPUT_SAMPLE_RATE = 16_000;

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const configuredFrameSamples = Number(options.processorOptions?.frameSamples);
    this.frameSamples = Number.isFinite(configuredFrameSamples) && configuredFrameSamples > 0
      ? Math.round(configuredFrameSamples)
      : 320;
    this.step = sampleRate / INPUT_SAMPLE_RATE;
    this.position = 0;
    this.previousSample = 0;
    this.frame = new Int16Array(this.frameSamples);
    this.frameOffset = 0;
  }

  appendSample(value) {
    const sample = Math.max(-1, Math.min(1, value));
    this.frame[this.frameOffset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    this.frameOffset += 1;
    if (this.frameOffset !== this.frameSamples) return;
    this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
    this.frame = new Int16Array(this.frameSamples);
    this.frameOffset = 0;
  }

  appendResampled(input) {
    if (input.length === 0) return;
    if (this.step === 1 && this.position === 0) {
      for (const sample of input) this.appendSample(sample);
      this.previousSample = input[input.length - 1] ?? 0;
      return;
    }

    while (Math.floor(this.position) + 1 < input.length) {
      const index = Math.floor(this.position);
      const start = index < 0 ? this.previousSample : (input[index] ?? 0);
      const end = input[index + 1] ?? 0;
      this.appendSample(start + (end - start) * (this.position - index));
      this.position += this.step;
    }
    this.previousSample = input[input.length - 1] ?? this.previousSample;
    this.position -= input.length;
  }

  process(inputs, outputs) {
    this.appendResampled(inputs[0]?.[0] ?? new Float32Array(0));
    for (const output of outputs) {
      for (const channel of output) channel.fill(0);
    }
    return true;
  }
}

registerProcessor('voice-capture-processor', VoiceCaptureProcessor);
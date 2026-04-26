let gpuMinerState = null;

async function initGpuMiner(maxAttempts = 2_000_000) {
    if (gpuMinerState) return gpuMinerState;

    if (!navigator.gpu) {
        throw new Error("WebGPU is not available");
    }

    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance"
    });

    if (!adapter) {
        throw new Error("No GPU adapter found");
    }

    const device = await adapter.requestDevice();

    const shaderCode = `
struct InputData {
    prefixLen: u32,
    startNonce: u32,
    attempts: u32,
    _pad: u32,
    targetBytes: array<u32, 32>,
    prefix: array<u32, 256>,
};

struct ResultData {
    found: atomic<u32>,
    nonce: atomic<u32>,
};

@group(0) @binding(0) var<storage, read> inputData: InputData;
@group(0) @binding(1) var<storage, read_write> resultData: ResultData;

const K: array<u32, 64> = array<u32, 64>(
    0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
    0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
    0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
    0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
    0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
    0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
    0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
    0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u
);

fn rotr(x: u32, n: u32) -> u32 { return (x >> n) | (x << (32u - n)); }
fn ch(x: u32, y: u32, z: u32) -> u32 { return (x & y) ^ ((~x) & z); }
fn maj(x: u32, y: u32, z: u32) -> u32 { return (x & y) ^ (x & z) ^ (y & z); }
fn bs0(x: u32) -> u32 { return rotr(x, 2u) ^ rotr(x, 13u) ^ rotr(x, 22u); }
fn bs1(x: u32) -> u32 { return rotr(x, 6u) ^ rotr(x, 11u) ^ rotr(x, 25u); }
fn ss0(x: u32) -> u32 { return rotr(x, 7u) ^ rotr(x, 18u) ^ (x >> 3u); }
fn ss1(x: u32) -> u32 { return rotr(x, 17u) ^ rotr(x, 19u) ^ (x >> 10u); }

fn nonceLen(nonce: u32) -> u32 {
    if (nonce >= 1000000000u) { return 10u; }
    if (nonce >= 100000000u) { return 9u; }
    if (nonce >= 10000000u) { return 8u; }
    if (nonce >= 1000000u) { return 7u; }
    if (nonce >= 100000u) { return 6u; }
    if (nonce >= 10000u) { return 5u; }
    if (nonce >= 1000u) { return 4u; }
    if (nonce >= 100u) { return 3u; }
    if (nonce >= 10u) { return 2u; }
    return 1u;
}

fn pow10(exp: u32) -> u32 {
    var r = 1u;
    for (var i = 0u; i < exp; i = i + 1u) { r = r * 10u; }
    return r;
}

fn nonceByte(nonce: u32, index: u32, len: u32) -> u32 {
    let divisor = pow10(len - index - 1u);
    return 48u + ((nonce / divisor) % 10u);
}

fn messageByte(index: u32, totalLen: u32, paddedLen: u32, nonce: u32, nLen: u32) -> u32 {
    if (index < totalLen) {
        if (index < inputData.prefixLen) { return inputData.prefix[index] & 255u; }
        return nonceByte(nonce, index - inputData.prefixLen, nLen);
    }

    if (index == totalLen) { return 0x80u; }

    if (index >= paddedLen - 8u) {
        let bitLen = totalLen * 8u;
        let shiftIndex = paddedLen - 1u - index;
        if (shiftIndex >= 4u) { return 0u; }
        return (bitLen >> (shiftIndex * 8u)) & 255u;
    }

    return 0u;
}

fn compress(hashPointer: ptr<function, array<u32, 8>>, wInput: ptr<function, array<u32, 64>>) {
    var w = *wInput;

    for (var i = 16u; i < 64u; i = i + 1u) {
        w[i] = ss1(w[i - 2u]) + w[i - 7u] + ss0(w[i - 15u]) + w[i - 16u];
    }

    var a = (*hashPointer)[0];
    var b = (*hashPointer)[1];
    var c = (*hashPointer)[2];
    var d = (*hashPointer)[3];
    var e = (*hashPointer)[4];
    var f = (*hashPointer)[5];
    var g = (*hashPointer)[6];
    var h = (*hashPointer)[7];

    for (var i = 0u; i < 64u; i = i + 1u) {
        let t1 = h + bs1(e) + ch(e, f, g) + K[i] + w[i];
        let t2 = bs0(a) + maj(a, b, c);
        h = g; g = f; f = e; e = d + t1;
        d = c; c = b; b = a; a = t1 + t2;
    }

    (*hashPointer)[0] = (*hashPointer)[0] + a;
    (*hashPointer)[1] = (*hashPointer)[1] + b;
    (*hashPointer)[2] = (*hashPointer)[2] + c;
    (*hashPointer)[3] = (*hashPointer)[3] + d;
    (*hashPointer)[4] = (*hashPointer)[4] + e;
    (*hashPointer)[5] = (*hashPointer)[5] + f;
    (*hashPointer)[6] = (*hashPointer)[6] + g;
    (*hashPointer)[7] = (*hashPointer)[7] + h;
}

fn sha256Header(nonce: u32) -> array<u32, 8> {
    var hash = array<u32, 8>(
        0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,
        0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u
    );

    let nLen = nonceLen(nonce);
    let totalLen = inputData.prefixLen + nLen;
    let paddedLen = ((totalLen + 9u + 63u) / 64u) * 64u;
    let blockCount = paddedLen / 64u;

    for (var blockIndex = 0u; blockIndex < blockCount; blockIndex = blockIndex + 1u) {
        var w = array<u32, 64>();

        for (var i = 0u; i < 16u; i = i + 1u) {
            let base = blockIndex * 64u + i * 4u;
            let b0 = messageByte(base, totalLen, paddedLen, nonce, nLen);
            let b1 = messageByte(base + 1u, totalLen, paddedLen, nonce, nLen);
            let b2 = messageByte(base + 2u, totalLen, paddedLen, nonce, nLen);
            let b3 = messageByte(base + 3u, totalLen, paddedLen, nonce, nLen);
            w[i] = (b0 << 24u) | (b1 << 16u) | (b2 << 8u) | b3;
        }

        compress(&hash, &w);
    }

    return hash;
}

fn digestByte(words: array<u32, 8>, index: u32) -> u32 {
    let wordIndex = index / 4u;
    let byteIndex = index % 4u;
    let shift = (3u - byteIndex) * 8u;
    return (words[wordIndex] >> shift) & 255u;
}

fn sha256Digest(words: array<u32, 8>) -> array<u32, 8> {
    var hash = array<u32, 8>(
        0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,
        0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u
    );

    var w = array<u32, 64>();

    for (var i = 0u; i < 16u; i = i + 1u) {
        let base = i * 4u;
        var b0 = 0u;
        var b1 = 0u;
        var b2 = 0u;
        var b3 = 0u;

        if (base < 32u) { b0 = digestByte(words, base); } else if (base == 32u) { b0 = 0x80u; }
        if (base + 1u < 32u) { b1 = digestByte(words, base + 1u); } else if (base + 1u == 32u) { b1 = 0x80u; }
        if (base + 2u < 32u) { b2 = digestByte(words, base + 2u); } else if (base + 2u == 32u) { b2 = 0x80u; }
        if (base + 3u < 32u) { b3 = digestByte(words, base + 3u); } else if (base + 3u == 32u) { b3 = 0x80u; }

        w[i] = (b0 << 24u) | (b1 << 16u) | (b2 << 8u) | b3;
    }

    w[15] = 256u;
    compress(&hash, &w);
    return hash;
}

fn hashByte(hash: array<u32, 8>, index: u32) -> u32 {
    let wordIndex = index / 4u;
    let byteIndex = index % 4u;
    let shift = (3u - byteIndex) * 8u;
    return (hash[wordIndex] >> shift) & 255u;
}

fn hashPassesTarget(hash: array<u32, 8>) -> bool {
    for (var i = 0u; i < 32u; i = i + 1u) {
        let h = hashByte(hash, i);
        let t = inputData.targetBytes[i] & 255u;
        if (h < t) { return true; }
        if (h > t) { return false; }
    }
    return true;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;
    if (index >= inputData.attempts) { return; }
    if (atomicLoad(&resultData.found) != 0u) { return; }

    let nonce = inputData.startNonce + index;
    let firstHash = sha256Header(nonce);
    let secondHash = sha256Digest(firstHash);

    if (hashPassesTarget(secondHash)) {
        atomicStore(&resultData.nonce, nonce);
        atomicStore(&resultData.found, 1u);
    }
}
`;

    const shaderModule = device.createShaderModule({ code: shaderCode });

    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }
        ]
    });

    const pipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        compute: { module: shaderModule, entryPoint: "main" }
    });

    const inputBufferSize = (4 + 32 + 256) * 4;

    const inputBuffer = device.createBuffer({
        size: inputBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    const resultBuffer = device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });

    const readBuffer = device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: inputBuffer } },
            { binding: 1, resource: { buffer: resultBuffer } }
        ]
    });

    gpuMinerState = {
        device,
        pipeline,
        inputBuffer,
        resultBuffer,
        readBuffer,
        bindGroup,
        maxAttempts
    };

    return gpuMinerState;
}

function prefixToU32(text) {
    const arr = new Uint32Array(256);
    for (let i = 0; i < text.length; i++) arr[i] = text.charCodeAt(i) & 255;
    return arr;
}

window.gpuHash = async function gpuHash(prefix, difficultyBytes, startNonce, attempts = 1_000_000) {
    const state = await initGpuMiner();

    attempts = Math.min(Math.max(Math.floor(attempts), 1), state.maxAttempts);
    startNonce = startNonce >>> 0;

    const prefixBytes = prefixToU32(prefix);
    const targetBytes = new Uint32Array(32);

    for (let i = 0; i < 32; i++) targetBytes[i] = difficultyBytes[i] ?? 0;

    const inputU32 = new Uint32Array(4 + 32 + 256);
    inputU32[0] = prefix.length;
    inputU32[1] = startNonce;
    inputU32[2] = attempts;
    inputU32[3] = 0;
    inputU32.set(targetBytes, 4);
    inputU32.set(prefixBytes, 36);

    state.device.queue.writeBuffer(state.inputBuffer, 0, inputU32);
    state.device.queue.writeBuffer(state.resultBuffer, 0, new Uint32Array([0, 0]));

    const encoder = state.device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    pass.setPipeline(state.pipeline);
    pass.setBindGroup(0, state.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(attempts / 256));
    pass.end();

    encoder.copyBufferToBuffer(state.resultBuffer, 0, state.readBuffer, 0, 8);
    state.device.queue.submit([encoder.finish()]);

    await state.readBuffer.mapAsync(GPUMapMode.READ);

    const result = new Uint32Array(state.readBuffer.getMappedRange().slice(0));

    state.readBuffer.unmap();

    return {
        found: result[0] === 1,
        nonce: result[1],
        attempts
    };
};
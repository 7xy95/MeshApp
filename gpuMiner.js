const { Gpu } = require("@sylphx/webgpu")

const GPUShaderStage = {
    VERTEX: 1,
    FRAGMENT: 2,
    COMPUTE: 4
}

const GPUBufferUsage = {
    MAP_READ: 1,
    MAP_WRITE: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
    INDEX: 16,
    VERTEX: 32,
    UNIFORM: 64,
    STORAGE: 128,
    INDIRECT: 256,
    QUERY_RESOLVE: 512
}

const GPUMapMode = {
    READ: 1,
    WRITE: 2
}

const nodeGpu = new Gpu()

let gpuMinerState = null
let gpuBusy = false

const SHA256_INIT = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);

const SHA256_K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);

function rotr32(value, shift) {
    return (value >>> shift) | (value << (32 - shift));
}

function sha256CompressState(hash, blockBytes, offset) {
    const w = new Uint32Array(64);

    for (let i = 0; i < 16; i++) {
        const j = offset + i * 4;
        w[i] = (
            (blockBytes[j] << 24) |
            (blockBytes[j + 1] << 16) |
            (blockBytes[j + 2] << 8) |
            blockBytes[j + 3]
        ) >>> 0;
    }

    for (let i = 16; i < 64; i++) {
        const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
        const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let i = 0; i < 64; i++) {
        const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
        const ch = ((e & f) ^ ((~e) & g)) >>> 0;
        const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
        const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const temp2 = (s0 + maj) >>> 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
}

function getNonceLength(startNonce) {
    if (startNonce >= 1000000000) return 10;
    if (startNonce >= 100000000) return 9;
    if (startNonce >= 10000000) return 8;
    if (startNonce >= 1000000) return 7;
    if (startNonce >= 100000) return 6;
    if (startNonce >= 10000) return 5;
    if (startNonce >= 1000) return 4;
    if (startNonce >= 100) return 3;
    if (startNonce >= 10) return 2;
    return 1;
}

function getNextNonceLengthBoundary(startNonce) {
    const nonceLength = getNonceLength(startNonce);

    if (nonceLength >= 10) {
        return 0x100000000;
    }

    return 10 ** nonceLength;
}

function precomputePrefix(prefix) {
    const prefixBytes = new Uint8Array(prefix.length);

    for (let i = 0; i < prefix.length; i++) {
        prefixBytes[i] = prefix.charCodeAt(i) & 255;
    }

    const fullPrefixBlocks = Math.floor(prefixBytes.length / 64);
    const hash = new Uint32Array(SHA256_INIT);

    for (let i = 0; i < fullPrefixBlocks; i++) {
        sha256CompressState(hash, prefixBytes, i * 64);
    }

    const tailStart = fullPrefixBlocks * 64;
    const tailLen = prefixBytes.length - tailStart;

    if (tailLen > 128) {
        throw new Error("GPU miner prefix tail is too long");
    }

    const prefixTail = new Uint32Array(128);

    for (let i = 0; i < tailLen; i++) {
        prefixTail[i] = prefixBytes[tailStart + i];
    }

    return {
        prefixLen: prefixBytes.length,
        prefixTailLen: tailLen,
        initialHash: hash,
        prefixTail
    };
}

async function initGpuMiner(maxAttempts = 2_000_000) {
    if (gpuMinerState) return gpuMinerState;

    if (!nodeGpu) {
        throw new Error("WebGPU is not available");
    }

    const adapter = await nodeGpu.requestAdapter({
        powerPreference: "high-performance"
    });

    if (!adapter) {
        throw new Error("No GPU adapter found");
    }

    const device = await adapter.requestDevice();

    const shaderCode = `
struct InputData {
    prefixLen: u32,
    prefixTailLen: u32,
    startNonce: u32,
    attempts: u32,
    nonceLen: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
    initialHash: array<u32, 8>,
    targetBytes: array<u32, 32>,
    prefixTail: array<u32, 128>,
};

struct ResultData {
    found: atomic<u32>,
    nonce: atomic<u32>,
};

@group(0) @binding(0) var<storage, read> inputData: InputData;
@group(0) @binding(1) var<storage, read_write> resultData: ResultData;

fn kAt(i: u32) -> u32 {
    if (i == 0u) { return 0x428a2f98u; }
    if (i == 1u) { return 0x71374491u; }
    if (i == 2u) { return 0xb5c0fbcfu; }
    if (i == 3u) { return 0xe9b5dba5u; }
    if (i == 4u) { return 0x3956c25bu; }
    if (i == 5u) { return 0x59f111f1u; }
    if (i == 6u) { return 0x923f82a4u; }
    if (i == 7u) { return 0xab1c5ed5u; }
    if (i == 8u) { return 0xd807aa98u; }
    if (i == 9u) { return 0x12835b01u; }
    if (i == 10u) { return 0x243185beu; }
    if (i == 11u) { return 0x550c7dc3u; }
    if (i == 12u) { return 0x72be5d74u; }
    if (i == 13u) { return 0x80deb1feu; }
    if (i == 14u) { return 0x9bdc06a7u; }
    if (i == 15u) { return 0xc19bf174u; }
    if (i == 16u) { return 0xe49b69c1u; }
    if (i == 17u) { return 0xefbe4786u; }
    if (i == 18u) { return 0x0fc19dc6u; }
    if (i == 19u) { return 0x240ca1ccu; }
    if (i == 20u) { return 0x2de92c6fu; }
    if (i == 21u) { return 0x4a7484aau; }
    if (i == 22u) { return 0x5cb0a9dcu; }
    if (i == 23u) { return 0x76f988dau; }
    if (i == 24u) { return 0x983e5152u; }
    if (i == 25u) { return 0xa831c66du; }
    if (i == 26u) { return 0xb00327c8u; }
    if (i == 27u) { return 0xbf597fc7u; }
    if (i == 28u) { return 0xc6e00bf3u; }
    if (i == 29u) { return 0xd5a79147u; }
    if (i == 30u) { return 0x06ca6351u; }
    if (i == 31u) { return 0x14292967u; }
    if (i == 32u) { return 0x27b70a85u; }
    if (i == 33u) { return 0x2e1b2138u; }
    if (i == 34u) { return 0x4d2c6dfcu; }
    if (i == 35u) { return 0x53380d13u; }
    if (i == 36u) { return 0x650a7354u; }
    if (i == 37u) { return 0x766a0abbu; }
    if (i == 38u) { return 0x81c2c92eu; }
    if (i == 39u) { return 0x92722c85u; }
    if (i == 40u) { return 0xa2bfe8a1u; }
    if (i == 41u) { return 0xa81a664bu; }
    if (i == 42u) { return 0xc24b8b70u; }
    if (i == 43u) { return 0xc76c51a3u; }
    if (i == 44u) { return 0xd192e819u; }
    if (i == 45u) { return 0xd6990624u; }
    if (i == 46u) { return 0xf40e3585u; }
    if (i == 47u) { return 0x106aa070u; }
    if (i == 48u) { return 0x19a4c116u; }
    if (i == 49u) { return 0x1e376c08u; }
    if (i == 50u) { return 0x2748774cu; }
    if (i == 51u) { return 0x34b0bcb5u; }
    if (i == 52u) { return 0x391c0cb3u; }
    if (i == 53u) { return 0x4ed8aa4au; }
    if (i == 54u) { return 0x5b9cca4fu; }
    if (i == 55u) { return 0x682e6ff3u; }
    if (i == 56u) { return 0x748f82eeu; }
    if (i == 57u) { return 0x78a5636fu; }
    if (i == 58u) { return 0x84c87814u; }
    if (i == 59u) { return 0x8cc70208u; }
    if (i == 60u) { return 0x90befffau; }
    if (i == 61u) { return 0xa4506cebu; }
    if (i == 62u) { return 0xbef9a3f7u; }
    return 0xc67178f2u;
}

fn pow10At(index: u32) -> u32 {
    if (index == 0u) { return 1u; }
    if (index == 1u) { return 10u; }
    if (index == 2u) { return 100u; }
    if (index == 3u) { return 1000u; }
    if (index == 4u) { return 10000u; }
    if (index == 5u) { return 100000u; }
    if (index == 6u) { return 1000000u; }
    if (index == 7u) { return 10000000u; }
    if (index == 8u) { return 100000000u; }
    return 1000000000u;
}

fn wordAt8(words: array<u32, 8>, index: u32) -> u32 {
    if (index == 0u) { return words[0]; }
    if (index == 1u) { return words[1]; }
    if (index == 2u) { return words[2]; }
    if (index == 3u) { return words[3]; }
    if (index == 4u) { return words[4]; }
    if (index == 5u) { return words[5]; }
    if (index == 6u) { return words[6]; }
    return words[7];
}

fn rotr(x: u32, n: u32) -> u32 {
    return (x >> n) | (x << (32u - n));
}

fn ch(x: u32, y: u32, z: u32) -> u32 {
    return (x & y) ^ ((~x) & z);
}

fn maj(x: u32, y: u32, z: u32) -> u32 {
    return (x & y) ^ (x & z) ^ (y & z);
}

fn bs0(x: u32) -> u32 {
    return rotr(x, 2u) ^ rotr(x, 13u) ^ rotr(x, 22u);
}

fn bs1(x: u32) -> u32 {
    return rotr(x, 6u) ^ rotr(x, 11u) ^ rotr(x, 25u);
}

fn ss0(x: u32) -> u32 {
    return rotr(x, 7u) ^ rotr(x, 18u) ^ (x >> 3u);
}

fn ss1(x: u32) -> u32 {
    return rotr(x, 17u) ^ rotr(x, 19u) ^ (x >> 10u);
}

fn nonceByte(nonce: u32, index: u32) -> u32 {
    let divisorIndex = inputData.nonceLen - index - 1u;
    let divisor = pow10At(divisorIndex);
    return 48u + ((nonce / divisor) % 10u);
}

fn remainingMessageByte(index: u32, remainingTotalLen: u32, paddedRemainingLen: u32, totalMessageLen: u32, nonce: u32) -> u32 {
    if (index < remainingTotalLen) {
        if (index < inputData.prefixTailLen) {
            return inputData.prefixTail[index] & 255u;
        }

        return nonceByte(nonce, index - inputData.prefixTailLen);
    }

    if (index == remainingTotalLen) {
        return 0x80u;
    }

    if (index >= paddedRemainingLen - 8u) {
        let bitLen = totalMessageLen * 8u;
        let shiftIndex = paddedRemainingLen - 1u - index;

        if (shiftIndex >= 4u) {
            return 0u;
        }

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
        let t1 = h + bs1(e) + ch(e, f, g) + kAt(i) + w[i];
        let t2 = bs0(a) + maj(a, b, c);

        h = g;
        g = f;
        f = e;
        e = d + t1;
        d = c;
        c = b;
        b = a;
        a = t1 + t2;
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
    var hash = inputData.initialHash;

    let totalMessageLen = inputData.prefixLen + inputData.nonceLen;
    let remainingTotalLen = inputData.prefixTailLen + inputData.nonceLen;
    let paddedRemainingLen = ((remainingTotalLen + 9u + 63u) / 64u) * 64u;
    let blockCount = paddedRemainingLen / 64u;

    for (var blockIndex = 0u; blockIndex < blockCount; blockIndex = blockIndex + 1u) {
        var w = array<u32, 64>();

        for (var i = 0u; i < 16u; i = i + 1u) {
            let base = blockIndex * 64u + i * 4u;

            let b0 = remainingMessageByte(base, remainingTotalLen, paddedRemainingLen, totalMessageLen, nonce);
            let b1 = remainingMessageByte(base + 1u, remainingTotalLen, paddedRemainingLen, totalMessageLen, nonce);
            let b2 = remainingMessageByte(base + 2u, remainingTotalLen, paddedRemainingLen, totalMessageLen, nonce);
            let b3 = remainingMessageByte(base + 3u, remainingTotalLen, paddedRemainingLen, totalMessageLen, nonce);

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
    let word = wordAt8(words, wordIndex);

    return (word >> shift) & 255u;
}

fn sha256Digest(words: array<u32, 8>) -> array<u32, 8> {
    var hash = array<u32, 8>(
        0x6a09e667u,
        0xbb67ae85u,
        0x3c6ef372u,
        0xa54ff53au,
        0x510e527fu,
        0x9b05688cu,
        0x1f83d9abu,
        0x5be0cd19u
    );

    var w = array<u32, 64>();

    for (var i = 0u; i < 16u; i = i + 1u) {
        let base = i * 4u;

        var b0 = 0u;
        var b1 = 0u;
        var b2 = 0u;
        var b3 = 0u;

        if (base < 32u) {
            b0 = digestByte(words, base);
        }
        else if (base == 32u) {
            b0 = 0x80u;
        }

        if (base + 1u < 32u) {
            b1 = digestByte(words, base + 1u);
        }
        else if (base + 1u == 32u) {
            b1 = 0x80u;
        }

        if (base + 2u < 32u) {
            b2 = digestByte(words, base + 2u);
        }
        else if (base + 2u == 32u) {
            b2 = 0x80u;
        }

        if (base + 3u < 32u) {
            b3 = digestByte(words, base + 3u);
        }
        else if (base + 3u == 32u) {
            b3 = 0x80u;
        }

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
    let word = wordAt8(hash, wordIndex);

    return (word >> shift) & 255u;
}

fn hashPassesTarget(hash: array<u32, 8>) -> bool {
    for (var i = 0u; i < 32u; i = i + 1u) {
        let h = hashByte(hash, i);
        let t = inputData.targetBytes[i] & 255u;

        if (h < t) {
            return true;
        }

        if (h > t) {
            return false;
        }
    }

    return true;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let index = globalId.x;

    if (index >= inputData.attempts) {
        return;
    }

    if (atomicLoad(&resultData.found) != 0u) {
        return;
    }

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

    const inputBufferSize = (8 + 8 + 32 + 128) * 4;

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

async function gpuHash(prefix, difficultyBytes, startNonce, attempts = 1_000_000) {
    if (gpuBusy) {
        return {
            found: false,
            nonce: 0,
            attempts: 0,
            busy: true
        }
    }

    gpuBusy = true

    try {
        const state = await initGpuMiner()

        startNonce = startNonce >>> 0

        const nonceLength = getNonceLength(startNonce)
        const nextBoundary = getNextNonceLengthBoundary(startNonce)
        const maxAttemptsBeforeLengthChange = Math.max(1, nextBoundary - startNonce)

        attempts = Math.min(
            Math.max(Math.floor(attempts), 1),
            state.maxAttempts,
            maxAttemptsBeforeLengthChange
        )

        const prefixData = precomputePrefix(prefix)
        const targetBytes = new Uint32Array(32)

        for (let i = 0; i < 32; i++) {
            targetBytes[i] = difficultyBytes[i] ?? 0
        }

        const inputU32 = new Uint32Array(8 + 8 + 32 + 128)

        inputU32[0] = prefixData.prefixLen
        inputU32[1] = prefixData.prefixTailLen
        inputU32[2] = startNonce
        inputU32[3] = attempts
        inputU32[4] = nonceLength
        inputU32[5] = 0
        inputU32[6] = 0
        inputU32[7] = 0
        inputU32.set(prefixData.initialHash, 8)
        inputU32.set(targetBytes, 16)
        inputU32.set(prefixData.prefixTail, 48)

        state.device.queue.writeBuffer(state.inputBuffer, 0, inputU32)
        state.device.queue.writeBuffer(state.resultBuffer, 0, new Uint32Array([0, 0]))

        const encoder = state.device.createCommandEncoder()
        const pass = encoder.beginComputePass()

        pass.setPipeline(state.pipeline)
        pass.setBindGroup(0, state.bindGroup)
        pass.dispatchWorkgroups(Math.ceil(attempts / 256))
        pass.end()

        const readBuffer = state.device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        })

        encoder.copyBufferToBuffer(state.resultBuffer, 0, readBuffer, 0, 8)
        state.device.queue.submit([encoder.finish()])

        await readBuffer.mapAsync("READ", 0, 8)

        let found = false
        let nonce = 0

        try {
            const mappedRange = readBuffer.getMappedRange(0, 8)
            const resultView = new Uint32Array(mappedRange)

            found = resultView[0] === 1
            nonce = resultView[1]
        }
        finally {
            readBuffer.unmap()
        }

        return {
            found,
            nonce,
            attempts
        }
    }
    finally {
        gpuBusy = false
    }
}

global.gpuHash = gpuHash
global.initGpuMiner = initGpuMiner
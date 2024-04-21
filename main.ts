import { EventType, WindowBuilder } from "https://deno.land/x/sdl2/mod.ts";
import { mat4, vec3 } from "npm:wgpu-matrix@2.8.0";
import {
  cubeVertexArray,
  cubeVertexSize,
  cubeUVOffset,
  cubePositionOffset,
  cubeVertexCount,
} from "./src/Cube.ts";

import basicVertWGSL from "./src/shaders/basic.vert.wgsl.ts";
import vertexPositionColorWGSL from "./src/shaders/vertexPositionColor.frag.wgsl.ts";

const window = new WindowBuilder("Hello, Deno!", 800, 600).build();

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No adapter found");
}
const device = await adapter.requestDevice();

/* Returns a Deno.UnsafeWindowSurface */
const surface = window.windowSurface();
/* Returns a WebGPU GPUCanvasContext */
const context = surface.getContext("webgpu");
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  width: 800,
  height: 600,
});

const currentTexture = context.getCurrentTexture();

// Create a vertex buffer from the cube data.
const verticesBuffer = device.createBuffer({
  size: cubeVertexArray.byteLength,
  usage: GPUBufferUsage.VERTEX,
  mappedAtCreation: true,
});
new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
verticesBuffer.unmap();

const pipeline = device.createRenderPipeline({
  layout: "auto",
  vertex: {
    module: device.createShaderModule({
      code: basicVertWGSL,
    }),
    buffers: [
      {
        arrayStride: cubeVertexSize,
        attributes: [
          {
            // position
            shaderLocation: 0,
            offset: cubePositionOffset,
            format: "float32x4",
          },
          {
            // uv
            shaderLocation: 1,
            offset: cubeUVOffset,
            format: "float32x2",
          },
        ],
      },
    ],
    entryPoint: "main",
  },
  fragment: {
    module: device.createShaderModule({
      code: vertexPositionColorWGSL,
    }),
    targets: [
      {
        format: presentationFormat,
      },
    ],
    entryPoint: "main", // Add the missing entryPoint property
  },
  primitive: {
    topology: "triangle-list",

    // Backface culling since the cube is solid piece of geometry.
    // Faces pointing away from the camera will be occluded by faces
    // pointing toward the camera.
    cullMode: "back",
  },

  // Enable depth testing so that the fragment closest to the camera
  // is rendered in front.
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: "less",
    format: "depth24plus",
  },
});

const depthTexture = device.createTexture({
  size: [currentTexture.width, currentTexture.height],
  format: "depth24plus",
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

const uniformBufferSize = 4 * 16; // 4x4 matrix
const uniformBuffer = device.createBuffer({
  size: uniformBufferSize,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const uniformBindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: uniformBuffer,
      },
    },
  ],
});

const renderPassDescriptor: GPURenderPassDescriptor = {
  colorAttachments: [
    {
      view: undefined, // Assigned later

      clearValue: [0.5, 0.5, 0.5, 1.0],
      loadOp: "clear",
      storeOp: "store",
    },
  ],
  depthStencilAttachment: {
    view: depthTexture.createView(),

    depthClearValue: 1.0,
    depthLoadOp: "clear",
    depthStoreOp: "store",
  },
};

const aspect = currentTexture.width / currentTexture.height;
const projectionMatrix = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100.0);
const modelViewProjectionMatrix = mat4.create();

function getTransformationMatrix() {
  const viewMatrix = mat4.identity();
  mat4.translate(viewMatrix, vec3.fromValues(0, 0, -4), viewMatrix);
  const now = Date.now() / 1000;
  mat4.rotate(
    viewMatrix,
    vec3.fromValues(Math.sin(now), Math.cos(now), 0),
    1,
    viewMatrix
  );

  mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);

  return modelViewProjectionMatrix as Float32Array;
}

function frame() {
  const transformationMatrix = getTransformationMatrix();
  device.queue.writeBuffer(
    uniformBuffer,
    0,
    transformationMatrix.buffer,
    transformationMatrix.byteOffset,
    transformationMatrix.byteLength
  );

  renderPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, uniformBindGroup);
  passEncoder.setVertexBuffer(0, verticesBuffer);
  passEncoder.draw(cubeVertexCount);
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);
  surface.present();
}

for await (const event of window.events()) {
  if (
    event.type === EventType.Quit ||
    (event.type === EventType.KeyDown && event.keysym.sym === 27) /* Escape */
  ) {
    break;
  } else if (event.type == EventType.Draw) {
    frame();
  }
}

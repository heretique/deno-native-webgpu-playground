import { EventType, WindowBuilder } from "https://deno.land/x/sdl2/mod.ts";

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

context.configure({ device, format: "bgra8unorm", width: 800, height: 600 });

for await (const event of window.events()) {
  if (
    event.type === EventType.Quit ||
    (event.type === EventType.KeyDown && event.keysym.sym === 27) /* Escape */
  ) {
    break;
  } else if (event.type == EventType.Draw) {
    // Sine wave
    const r = Math.sin(Date.now() / 1000) / 2 + 0.5;
    const g = Math.sin(Date.now() / 1000 + 2) / 2 + 0.5;
    const b = Math.sin(Date.now() / 1000 + 4) / 2 + 0.5;
    const textureView = context.getCurrentTexture().createView();
    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r, g, b, a: 1.0 },
          loadOp: "clear" as const,
          storeOp: "store" as const,
        },
      ],
    };

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
    surface.present();
  }
}

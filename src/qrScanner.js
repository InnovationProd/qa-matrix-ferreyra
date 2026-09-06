import jsQR from 'jsqr';

// Starts the device camera on the given <video> element and calls onResult(text)
// the first time a QR code is decoded. Returns a stop() function to release the camera.
export async function startQrScanner(videoEl, canvasEl, onResult, onError) {
  let stream = null;
  let rafId = null;
  let stopped = false;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    onError && onError('No se pudo acceder a la cámara. Revisá los permisos del navegador.');
    return () => {};
  }

  videoEl.srcObject = stream;
  await videoEl.play();

  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });

  function tick() {
    if (stopped) return;
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        stopped = true;
        stop();
        onResult(code.data);
        return;
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach(t => t.stop());
  }

  rafId = requestAnimationFrame(tick);
  return stop;
}

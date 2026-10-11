const scanIntervalMs = 220;
const maxScanWidth = 480;

export class CameraError extends Error {
  constructor(message) {
    super(message);
    this.name = "CameraError";
  }
}

function describeCameraFailure(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Camera access was blocked. Allow it in your browser, or type the code instead.";
  }
  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") {
    return "No camera found on this device. Type the code instead.";
  }
  return "Couldn't start the camera. Type the code instead.";
}

// Starts a camera preview on `video` and calls onText for each distinct QR payload.
// Uses the native BarcodeDetector when present and falls back to jsQR (loaded on demand).
export async function startQrScan(video, onText) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("Camera scanning needs a secure connection. Type the code instead.");
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
  } catch (error) {
    throw new CameraError(describeCameraFailure(error));
  }

  let stopped = false;
  let timer = 0;
  const stop = () => {
    stopped = true;
    window.clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };

  try {
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();

    const detector = "BarcodeDetector" in window ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
    const jsQR = detector ? null : (await import("jsqr")).default;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let lastText = "";

    const readFrame = async () => {
      if (detector) {
        const codes = await detector.detect(video);
        return codes[0]?.rawValue ?? "";
      }
      if (!video.videoWidth) return "";
      const scale = Math.min(1, maxScanWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? "";
    };

    const tick = async () => {
      if (stopped) return;
      try {
        const text = await readFrame();
        if (text && text !== lastText && !stopped) {
          lastText = text;
          onText(text);
        }
      } catch {
        // Individual frames can fail while the camera warms up.
      }
      if (!stopped) timer = window.setTimeout(tick, scanIntervalMs);
    };
    timer = window.setTimeout(tick, scanIntervalMs);
  } catch (error) {
    stop();
    throw error instanceof CameraError ? error : new CameraError(describeCameraFailure(error));
  }

  return stop;
}

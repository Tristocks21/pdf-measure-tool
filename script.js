import { getDocument, GlobalWorkerOptions } from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs";

const pdfFileInput = document.getElementById("pdfFile");
const pageNumberInput = document.getElementById("pageNumber");
const zoomInput = document.getElementById("zoomLevel");
const knownDistanceInput = document.getElementById("knownDistance");
const renderButton = document.getElementById("renderPage");
const setCalibrationButton = document.getElementById("setCalibration");
const clearPointsButton = document.getElementById("clearPoints");

const statusText = document.getElementById("statusText");
const pixelDistanceOutput = document.getElementById("pixelDistance");
const scaleOutput = document.getElementById("scaleValue");
const meterDistanceOutput = document.getElementById("meterDistance");

const canvas = document.getElementById("pdfCanvas");
const ctx = canvas.getContext("2d");

let pdfDoc = null;
let currentPage = null;
let points = [];
let lastSegmentPixels = null;
let metersPerPixel = null;

function updateStatus(text) {
  statusText.textContent = text;
}

function resetMeasurementOutputs() {
  pixelDistanceOutput.textContent = "—";
  meterDistanceOutput.textContent = "—";
}

function drawPoint(point) {
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawSegment(a, b) {
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function measurePixels(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function updateOutputs() {
  if (lastSegmentPixels == null) {
    resetMeasurementOutputs();
    return;
  }

  pixelDistanceOutput.textContent = lastSegmentPixels.toFixed(2);

  if (metersPerPixel != null) {
    meterDistanceOutput.textContent = (lastSegmentPixels * metersPerPixel).toFixed(3);
  } else {
    meterDistanceOutput.textContent = "Set calibration";
  }
}

function drawOverlay() {
  if (!points.length) {
    return;
  }

  points.forEach(drawPoint);
  if (points.length === 2) {
    drawSegment(points[0], points[1]);
  }
}

async function renderCurrentPage() {
  if (!pdfDoc) {
    updateStatus("Upload a PDF first.");
    return;
  }

  const requestedPage = Number(pageNumberInput.value);
  if (!Number.isFinite(requestedPage) || requestedPage < 1 || requestedPage > pdfDoc.numPages) {
    updateStatus(`Page must be between 1 and ${pdfDoc.numPages}.`);
    return;
  }

  const scale = Number(zoomInput.value) || 1;
  currentPage = await pdfDoc.getPage(requestedPage);
  const viewport = currentPage.getViewport({ scale });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await currentPage.render({ canvasContext: ctx, viewport }).promise;
  points = [];
  lastSegmentPixels = null;
  updateOutputs();
  drawOverlay();
  updateStatus(`Rendered page ${requestedPage}/${pdfDoc.numPages}. Click two points to measure.`);
}

async function loadPdfFromInput(file) {
  if (!file) {
    return;
  }

  const bytes = await file.arrayBuffer();
  pdfDoc = await getDocument({ data: bytes }).promise;
  pageNumberInput.max = String(pdfDoc.numPages);
  pageNumberInput.value = "1";

  updateStatus(`Loaded ${file.name} with ${pdfDoc.numPages} page(s).`);
  await renderCurrentPage();
}

function getCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

pdfFileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  await loadPdfFromInput(file);
});

renderButton.addEventListener("click", async () => {
  await renderCurrentPage();
});

canvas.addEventListener("click", async (event) => {
  if (!currentPage) {
    updateStatus("Load and render a page before measuring.");
    return;
  }

  if (points.length === 2) {
    await renderCurrentPage();
  }

  points.push(getCanvasCoordinates(event));
  drawOverlay();

  if (points.length === 2) {
    lastSegmentPixels = measurePixels(points[0], points[1]);
    updateOutputs();
    updateStatus("Segment captured. Set calibration to convert pixels to meters.");
  }
});

setCalibrationButton.addEventListener("click", () => {
  const knownDistance = Number(knownDistanceInput.value);
  if (!Number.isFinite(knownDistance) || knownDistance <= 0) {
    updateStatus("Enter a valid known distance in meters.");
    return;
  }

  if (!lastSegmentPixels || lastSegmentPixels <= 0) {
    updateStatus("Measure a segment first.");
    return;
  }

  metersPerPixel = knownDistance / lastSegmentPixels;
  scaleOutput.textContent = metersPerPixel.toExponential(4);
  updateOutputs();
  updateStatus("Calibration updated. New measurements use real units.");
});

clearPointsButton.addEventListener("click", async () => {
  if (!currentPage) {
    return;
  }

  await renderCurrentPage();
  updateStatus("Points cleared.");
});

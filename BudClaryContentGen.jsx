import { useState, useRef } from "react";

// ── CONFIG ────────────────────────────────────────────────────────────────────
const API_URL = (import.meta.env.VITE_API_URL || "https://bcaipro.dinofreud.workers.dev")
  .replace(/\/$/, "");

async function callApi(path, options) {
  if (!API_URL) {
    throw new Error("The API service is not configured.");
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
}
// ─────────────────────────────────────────────────────────────────────────────

const ANGLES = [
  { label: "Front 3/4",  prompt: "front three-quarter view, shot from slightly above driver side front corner" },
  { label: "Rear 3/4",   prompt: "rear three-quarter view, shot from slightly above passenger side rear corner" },
  { label: "Driver Side", prompt: "straight-on driver side profile view" },
  { label: "Interior",   prompt: "interior shot from open driver door, showing dashboard, steering wheel, and seats" },
];

async function generateDescription(vehicleInfo) {
  const res = await callApi("/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Write a compelling, natural vehicle listing description for a Bud Clary dealership.
Vehicle info: ${vehicleInfo}

Write 3–4 sentences. Lead with the most exciting feature. Sound like a real salesperson who loves cars, not a chatbot. No bullet points. No emojis. End with a call to action to visit Bud Clary.`
      }]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Description generation failed");
  return data.choices?.[0]?.message?.content || "";
}

async function generateSingleImage(promptText) {
  const res = await callApi("/v1/images/generations", {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: promptText,
      n: 1,
      size: "1536x1024",
      output_format: "png",
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Image generation failed");
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");
  return `data:image/png;base64,${b64}`;
}

async function researchVehicle(vehicleInfo) {
  const res = await callApi("/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `You are a precise automotive visual researcher. Given this vehicle: ${vehicleInfo}

Return a single detailed visual description paragraph covering:
- Exact exterior color name and finish
- Body style and silhouette shape
- Distinctive grille, headlight, and taillight design for this specific year/trim
- Wheel style and size
- Any trim-specific badges, accents, or body kit elements
- Overall proportions

Be specific to this exact year, make, model and trim. This will be used as an image generation prompt so precision matters. No bullet points, just one flowing description paragraph.`
      }]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Research failed");
  return data.choices?.[0]?.message?.content || vehicleInfo;
}

async function generateAllAngles(vehicleInfo) {
  const visualBrief = await researchVehicle(vehicleInfo);
  return Promise.all(
    ANGLES.map(angle =>
      generateSingleImage(
        `Professional automotive dealership photo. ${angle.prompt}. The vehicle is: ${visualBrief}. Clean white or light gradient studio background, showroom lighting, no clipping, full vehicle visible, no text, no watermarks, photorealistic.`
      )
    )
  );
}

async function generateAllAnglesFromPhoto(base64Data, mimeType, vehicleInfo) {
  // Vision reads the photo + we research the model for accuracy
  const [visionRes, visualBrief] = await Promise.all([
    callApi("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } },
            { type: "text", text: `Describe this specific vehicle for image generation: exact color, body style, trim badges, wheel design, grille shape, headlight design, and any distinctive features visible. Be precise. Context: ${vehicleInfo}` }
          ]
        }]
      })
    }).then(r => r.json()),
    researchVehicle(vehicleInfo)
  ]);

  if (!visionRes.choices) throw new Error(visionRes.error?.message || "Vision analysis failed");
  const photoDescription = visionRes.choices?.[0]?.message?.content || "";
  const combinedBrief = `${visualBrief} Additional details from actual vehicle photo: ${photoDescription}`;

  return Promise.all(
    ANGLES.map(angle =>
      generateSingleImage(
        `Professional automotive dealership photo. ${angle.prompt}. The vehicle is: ${combinedBrief}. Clean white or light gradient studio background, showroom lighting, no clipping, full vehicle visible, no text, no watermarks, photorealistic.`
      )
    )
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalesEdge() {
  const [vehicleInfo, setVehicleInfo]     = useState("");
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [inputMode, setInputMode]         = useState("text");
  const [status, setStatus]               = useState(null);
  const [currentStep, setCurrentStep]     = useState(null);
  const [error, setError]                 = useState("");
  const [description, setDescription]     = useState("");
  const [images, setImages]               = useState([]); // array of 4 urls
  const [activeAngle, setActiveAngle]     = useState(0);
  const fileRef = useRef();

  const running = status === "running";

  function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setUploadedPhoto({
      base64: ev.target.result.split(",")[1],
      mimeType: file.type,
      preview: ev.target.result
    });
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!vehicleInfo.trim()) { setError("Enter vehicle details first."); return; }
    if (inputMode === "photo" && !uploadedPhoto) { setError("Upload a photo first."); return; }
    setError(""); setStatus("running");
    setDescription(""); setImages([]); setActiveAngle(0);

    try {
      setCurrentStep("description");
      const desc = await generateDescription(vehicleInfo);
      setDescription(desc);

      setCurrentStep("images");
      const imgs = inputMode === "photo"
        ? await generateAllAnglesFromPhoto(uploadedPhoto.base64, uploadedPhoto.mimeType, vehicleInfo)
        : await generateAllAngles(vehicleInfo);
      setImages(imgs);

      setStatus("done"); setCurrentStep(null);
    } catch (err) {
      setError(err.message); setStatus("error"); setCurrentStep(null);
    }
  }

  function reset() {
    setStatus(null); setCurrentStep(null); setError("");
    setDescription(""); setImages([]); setActiveAngle(0);
    setUploadedPhoto(null); setVehicleInfo(""); setInputMode("text");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0d", fontFamily: "'Inter', sans-serif", color: "#f0f0f0" }}>

      {/* Header */}
      <div style={{ background: "#111", borderBottom: "2px solid #c8a84b", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", color: "#c8a84b", textTransform: "uppercase" }}>Bud Clary Auto Group</span>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.04em", color: "#fff", marginTop: 3 }}>AI Content Studio</span>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 24px" }}>

        {/* Vehicle Input */}
        <section style={{ marginBottom: 24 }}>
          <SectionLabel>Vehicle</SectionLabel>
          <div style={{ display: "flex", gap: 0, marginBottom: 14, border: "1px solid #2a2a2a", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
            {["text", "photo"].map(m => (
              <button key={m} onClick={() => setInputMode(m)} disabled={running} style={{
                padding: "8px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                background: inputMode === m ? "#c8a84b" : "transparent",
                color: inputMode === m ? "#0d0d0d" : "#666",
                transition: "all 0.15s", fontFamily: "inherit"
              }}>
                {m === "text" ? "Enter details" : "Upload photo"}
              </button>
            ))}
          </div>

          <textarea
            placeholder="e.g. 2024 Chevy Trax RS, Radiant Red, 1.2L turbo, 32k miles, sunroof, wireless CarPlay"
            value={vehicleInfo} onChange={e => setVehicleInfo(e.target.value)}
            rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} disabled={running}
          />

          {inputMode === "photo" && (
            <div style={{ marginTop: 10 }}>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
              {uploadedPhoto ? (
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <img src={uploadedPhoto.preview} alt="upload" style={{ width: 110, height: 74, objectFit: "cover", borderRadius: 6, border: "1px solid #2a2a2a" }} />
                  <button onClick={() => { setUploadedPhoto(null); fileRef.current.value = ""; }} style={ghostBtn}>Remove</button>
                </div>
              ) : (
                <button onClick={() => fileRef.current.click()} style={ghostBtn}>+ Choose photo</button>
              )}
            </div>
          )}
        </section>

        {/* Pipeline */}
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Pipeline</SectionLabel>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <PipelineChip label="Description" icon="✦" active />
            <Arrow />
            <PipelineChip label="4 Angles" icon="◈" active />
            <Arrow />
            <PipelineChip label="Video" icon="▶" active={false} badge="Coming soon" />
          </div>
        </section>

        {/* Error */}
        {error && (
          <div style={{ background: "#1a0a0a", border: "1px solid #5c1a1a", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#e07070" }}>
            {error}
          </div>
        )}

        {/* Generate button */}
        {status !== "done" && (
          <button onClick={handleGenerate} disabled={running} style={{
            width: "100%", padding: "14px", fontSize: 13, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase",
            background: running ? "#1e1e1e" : "#c8a84b",
            color: running ? "#444" : "#0d0d0d",
            border: "none", borderRadius: 8, cursor: running ? "not-allowed" : "pointer",
            transition: "all 0.2s", marginBottom: 28, fontFamily: "inherit"
          }}>
            {running ? "Generating..." : "Generate Content"}
          </button>
        )}

        {/* Progress */}
        {running && (
          <div style={{ display: "flex", marginBottom: 28, borderRadius: 8, overflow: "hidden", border: "1px solid #1e1e1e" }}>
            {["description", "images"].map((step, i) => {
              const done = (step === "description" && description) || (step === "images" && images.length > 0);
              const active = currentStep === step;
              return (
                <div key={step} style={{
                  flex: 1, padding: "11px 14px", textAlign: "center",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                  background: done ? "#0f1f0f" : active ? "#131320" : "#111",
                  color: done ? "#5aaa5a" : active ? "#c8a84b" : "#333",
                  borderRight: i === 0 ? "1px solid #1e1e1e" : "none",
                  transition: "all 0.3s"
                }}>
                  {done ? "✓ " : active ? "· " : ""}{step === "description" ? "Writing description" : "Researching & generating 4 angles"}
                </div>
              );
            })}
          </div>
        )}

        {/* Description result */}
        {description && (
          <ResultCard label="Description" copyText={description}>
            <p style={{ margin: 0, lineHeight: 1.8, fontSize: 15, color: "#e0e0e0" }}>{description}</p>
          </ResultCard>
        )}

        {/* Image gallery */}
        {images.length > 0 && (
          <ResultCard label="Vehicle Images — 4 Angles">
            {/* Main image */}
            <img
              src={images[activeAngle]}
              alt={ANGLES[activeAngle].label}
              style={{ width: "100%", borderRadius: 6, display: "block", marginBottom: 12 }}
            />
            {/* Thumbnail strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {images.map((url, i) => (
                <div key={i} onClick={() => setActiveAngle(i)} style={{
                  cursor: "pointer", borderRadius: 6, overflow: "hidden",
                  border: `2px solid ${activeAngle === i ? "#c8a84b" : "transparent"}`,
                  transition: "border 0.15s"
                }}>
                  <img src={url} alt={ANGLES[i].label} style={{ width: "100%", display: "block", aspectRatio: "1", objectFit: "cover" }} />
                  <div style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: activeAngle === i ? "#c8a84b" : "#444", padding: "4px 0", background: "#0d0d0d", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {ANGLES[i].label}
                  </div>
                </div>
              ))}
            </div>
            {/* Download all */}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {images.map((url, i) => (
                <a key={i} href={url} download={`vehicle-${ANGLES[i].label.toLowerCase().replace(" ", "-")}.png`}
                  style={{ ...ghostBtn, textDecoration: "none", fontSize: 10 }}>
                  ↓ {ANGLES[i].label}
                </a>
              ))}
            </div>
          </ResultCard>
        )}

        {status === "done" && (
          <button onClick={reset} style={{ ...ghostBtn, width: "100%", marginTop: 4, padding: "13px", textAlign: "center", fontFamily: "inherit" }}>
            ← New Vehicle
          </button>
        )}

      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", color: "#c8a84b", textTransform: "uppercase", marginBottom: 12 }}>{children}</div>;
}

function Arrow() {
  return <div style={{ color: "#2a2a2a", fontSize: 18, userSelect: "none" }}>→</div>;
}

function PipelineChip({ label, icon, active, badge }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 8,
      border: `1px solid ${active ? "#c8a84b44" : "#1e1e1e"}`,
      background: active ? "#1a1508" : "#111",
      color: active ? "#c8a84b" : "#333",
      fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", userSelect: "none"
    }}>
      <span style={{ fontSize: 10 }}>{icon}</span>
      {label}
      {badge && (
        <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: "#1e1e1e", color: "#444", fontWeight: 600 }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function ResultCard({ label, children, copyText }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, marginBottom: 18, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderBottom: "1px solid #1e1e1e" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", color: "#c8a84b", textTransform: "uppercase" }}>{label}</span>
        {copyText && (
          <button onClick={() => { navigator.clipboard.writeText(copyText); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={ghostBtn}>
            {copied ? "Copied!" : "Copy"}
          </button>
        )}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: "#111", border: "1px solid #1e1e1e",
  borderRadius: 8, padding: "11px 14px", fontSize: 14, color: "#f0f0f0", outline: "none", fontFamily: "inherit"
};

const ghostBtn = {
  background: "transparent", border: "1px solid #2a2a2a", borderRadius: 6, padding: "5px 12px",
  fontSize: 11, color: "#888", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, letterSpacing: "0.04em"
};
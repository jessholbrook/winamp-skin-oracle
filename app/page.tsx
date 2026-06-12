"use client";

import { useEffect, useRef, useState } from "react";
import { renderSkin, downloadSkinPNG, type SkinSpec } from "@/lib/winamp";
import { buildWSZBlob, downloadWSZ } from "@/lib/wsz";

interface WebampInstance {
  renderWhenReady(node: HTMLElement): Promise<void>;
  dispose(): void;
}

type Phase = "intro" | "loadingQ" | "quiz" | "summoning" | "result";

const SUMMON_LINES = [
  "consulting the llama...",
  "defragmenting your aura...",
  "buffering 3% ... 14% ... 89% ...",
  "rendering chrome at 56k...",
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [draft, setDraft] = useState("");
  const [spec, setSpec] = useState<SkinSpec | null>(null);
  const [error, setError] = useState("");
  const [summonLine, setSummonLine] = useState(0);
  const [showWebamp, setShowWebamp] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const webampStageRef = useRef<HTMLDivElement>(null);
  const webampRef = useRef<WebampInstance | null>(null);

  useEffect(() => {
    if (phase === "quiz") inputRef.current?.focus();
  }, [phase, current]);

  useEffect(() => {
    if (phase !== "summoning") return;
    const id = setInterval(() => setSummonLine((n) => (n + 1) % SUMMON_LINES.length), 1400);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "result" && spec && canvasRef.current) {
      renderSkin(canvasRef.current, spec, answers.join("|"));
      // debug hook for automated verification of the .wsz output
      (window as unknown as Record<string, unknown>).__oracleBuildWSZ = () =>
        buildWSZBlob(spec, answers.join("|"));
    }
  }, [phase, spec, answers]);

  // Webamp live preview — recreated whenever the spec changes (e.g. rename)
  useEffect(() => {
    if (!showWebamp || !spec || phase !== "result") return;
    let cancelled = false;
    let url = "";
    (async () => {
      const Webamp = (await import("webamp")).default;
      if (cancelled || !webampStageRef.current) return;
      url = URL.createObjectURL(buildWSZBlob(spec, answers.join("|")));
      const webamp = new Webamp({ initialSkin: { url } }) as unknown as WebampInstance;
      webampRef.current = webamp;
      await webamp.renderWhenReady(webampStageRef.current);
    })();
    return () => {
      cancelled = true;
      webampRef.current?.dispose();
      webampRef.current = null;
      if (url) URL.revokeObjectURL(url);
    };
  }, [showWebamp, spec, phase, answers]);

  async function begin() {
    setShowWebamp(false);
    setPhase("loadingQ");
    setError("");
    try {
      const res = await fetch("/api/questions");
      const data = await res.json();
      setQuestions(data.questions);
      setAnswers([]);
      setCurrent(0);
      setDraft("");
      setPhase("quiz");
    } catch {
      setError("The oracle is unreachable. Try again.");
      setPhase("intro");
    }
  }

  async function submitAnswer() {
    const answer = draft.trim();
    if (!answer) return;
    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);
    setDraft("");

    if (current + 1 < questions.length) {
      setCurrent(current + 1);
      return;
    }

    setPhase("summoning");
    try {
      const res = await fetch("/api/skin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qa: questions.map((q, i) => ({ question: q, answer: nextAnswers[i] })),
        }),
      });
      const data = await res.json();
      setSpec(data.spec);
      setPhase("result");
    } catch {
      setError("The skin dissolved before it could materialize. Try again.");
      setPhase("intro");
    }
  }

  return (
    <main className="shell">
      <div className="titlebar">
        <span>Winamp Skin Oracle</span>
        <span className="dots"><span /><span /><span /></span>
      </div>
      <div className="inner">
        {phase === "intro" && (
          <>
            <h1>Skin Oracle</h1>
            <p className="tagline">
              The oracle will ask you three questions. They will not make sense.
              Answer them anyway. A classic Winamp skin will be generated from
              whatever you say. It really whips.
            </p>
            <button onClick={begin}>Begin the ritual ▸</button>
            {error && <p className="err">{error}</p>}
          </>
        )}

        {phase === "loadingQ" && (
          <p className="loading">
            the oracle is composing its questions<span className="blink">█</span>
          </p>
        )}

        {phase === "quiz" && (
          <>
            <p className="qcount">QUESTION {current + 1} / {questions.length}</p>
            <p className="question">{questions[current]}</p>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              maxLength={200}
              placeholder="answer truthfully (or not)"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
            />
            <button onClick={submitAnswer} disabled={!draft.trim()}>
              {current + 1 < questions.length ? "Next ▸" : "Summon the skin ▸▸"}
            </button>
          </>
        )}

        {phase === "summoning" && (
          <p className="loading">
            {SUMMON_LINES[summonLine]}
            <span className="blink">█</span>
          </p>
        )}

        {phase === "result" && spec && (
          <>
            <input
              className="rename"
              value={spec.skinName}
              maxLength={32}
              spellCheck={false}
              title="click to rename"
              onChange={(e) => setSpec({ ...spec, skinName: e.target.value })}
            />
            <p className="tagline">&ldquo;{spec.vibe}&rdquo;</p>
            <div className="skin-frame">
              <canvas ref={canvasRef} />
            </div>
            <div className="specmeta">
              <b>TEXTURE</b> {spec.texture} &nbsp;·&nbsp; <b>SHAPE</b> {spec.shape ?? "classic"}{" "}
              &nbsp;·&nbsp; <b>NOW PLAYING</b> {spec.trackTitle}
              <div className="swatches">
                {Object.values(spec.colors).map((hex, i) => (
                  <i key={i} style={{ background: hex }} title={hex} />
                ))}
              </div>
            </div>
            <button onClick={() => downloadWSZ(spec, answers.join("|"))}>
              ▼ Download .wsz
            </button>
            <button className="secondary" onClick={() => setShowWebamp(!showWebamp)}>
              {showWebamp ? "Close preview" : "▶ Preview in Webamp"}
            </button>
            <button className="secondary" onClick={() => downloadSkinPNG(spec, answers.join("|"))}>
              ▼ PNG
            </button>
            <button className="secondary" onClick={begin}>
              Consult again
            </button>
            {showWebamp && (
              <div className="webamp-stage" ref={webampStageRef}>
                <p className="webamp-hint">
                  drag the windows around — EQ/playlist show base-skin art
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

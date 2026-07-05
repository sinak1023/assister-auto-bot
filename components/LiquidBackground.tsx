/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useEffect, useRef, type CSSProperties } from "react";

// Ambient "liquid" backdrop: neon blobs that drift, follow the pointer with
// parallax, and slowly cycle hue. Purely decorative, behind all content, and
// disabled under prefers-reduced-motion.
export function LiquidBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Target pointer position (0..1) and a smoothed current position.
    let tx = 0.5;
    let ty = 0.35;
    let cx = tx;
    let cy = ty;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth;
      ty = e.clientY / window.innerHeight;
    };

    const tick = () => {
      cx += (tx - cx) * 0.05;
      cy += (ty - cy) * 0.05;
      el.style.setProperty("--mx", cx.toFixed(4));
      el.style.setProperty("--my", cy.toFixed(4));
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="liquid-bg" style={{ "--mx": 0.5, "--my": 0.35 } as CSSProperties}>
      <span className="blob blob-a" />
      <span className="blob blob-b" />
      <span className="blob blob-c" />
      <style jsx>{`
        .liquid-bg {
          position: fixed;
          inset: 0;
          z-index: -10;
          overflow: hidden;
          pointer-events: none;
          animation: hue 24s linear infinite;
        }
        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          mix-blend-mode: screen;
          opacity: 0.5;
          will-change: transform;
        }
        /* azure — tracks the pointer most strongly */
        .blob-a {
          width: 46vw;
          height: 46vw;
          background: radial-gradient(circle, oklch(0.68 0.2 245) 0%, transparent 70%);
          left: calc(var(--mx) * 40% - 6%);
          top: calc(var(--my) * 40% - 4%);
          animation: drift-a 26s ease-in-out infinite;
        }
        /* gold — counter-parallax */
        .blob-b {
          width: 40vw;
          height: 40vw;
          background: radial-gradient(circle, oklch(0.8 0.16 85) 0%, transparent 70%);
          right: calc(var(--mx) * 34% - 4%);
          top: calc((1 - var(--my)) * 34% + 6%);
          animation: drift-b 32s ease-in-out infinite;
        }
        /* positive-green — slow ambient */
        .blob-c {
          width: 38vw;
          height: 38vw;
          background: radial-gradient(circle, oklch(0.72 0.2 150) 0%, transparent 70%);
          left: calc(var(--mx) * 24% + 30%);
          bottom: calc(var(--my) * 28% - 4%);
          animation: drift-c 38s ease-in-out infinite;
          opacity: 0.4;
        }
        @keyframes hue {
          to {
            filter: hue-rotate(360deg);
          }
        }
        @keyframes drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(6vw, 4vh) scale(1.12); }
        }
        @keyframes drift-b {
          0%, 100% { transform: translate(0, 0) scale(1.05); }
          50% { transform: translate(-5vw, 5vh) scale(0.92); }
        }
        @keyframes drift-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(4vw, -5vh) scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .liquid-bg, .blob { animation: none; }
        }
      `}</style>
    </div>
  );
}

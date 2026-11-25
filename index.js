import React from "https://esm.sh/react@19.1.0";
import { createRoot } from "https://esm.sh/react-dom@19.1.0/client?external=react";
import { motion, useReducedMotion } from "https://esm.sh/framer-motion@12.23.12?external=react";
import { ArrowDown, ArrowRight, ArrowUpRight, Map, UsersRound, Swords, Trophy } from "https://esm.sh/lucide-react?external=react";

const h = React.createElement;
const Arrow = ({ diagonal = false }) => h(diagonal ? ArrowUpRight : ArrowRight, { "aria-hidden": true, className: "icon", size: 16, strokeWidth: 1.8 });
const items = [
  { label: "Read the map", copy: "Spot the opening. Pick the moment. Set the pace.", icon: Map },
  { label: "Fight as one", copy: "Good calls become great plays when the team moves together.", icon: UsersRound },
  { label: "Take the opening", copy: "Turn one good moment into a fight worth remembering.", icon: Swords },
];
const sectionKicker = (number, label) => h("div", { className: "section-kicker" }, h("span", null, number), h("i"), ` ${label}`);
const button = (label, href, diagonal = false) => h("a", { className: "button button-primary", href, target: "_blank", rel: "noreferrer" }, label, h(Arrow, { diagonal }));
const principle = (item, index, enter) => h(motion.article, { className: "principle-card glass-panel", key: item.label, ...enter(index * .08) },
  h("div", { className: "principle-icon" }, h(item.icon, { "aria-hidden": true, size: 21, strokeWidth: 1.7 })),
  h("h3", null, item.label), h("p", null, item.copy));

function App() {
  const reduceMotion = useReducedMotion();
  const enter = (delay = 0) => reduceMotion ? {} : {
    initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 },
    transition: { duration: .7, delay, ease: [.22, 1, .36, 1] },
  };
  return h("div", { className: "site-shell" },
    h("header", { className: "topbar" },
      h("a", { className: "wordmark logo-link", href: "#top", "aria-label": "ProNoobs Dota home" }, h("img", { className: "brand-logo", src: "./assets/pro-noobs-ogre-logo.png", alt: "ProNoobs Dota logo featuring Ogre Magi" })),
      h("nav", { "aria-label": "Main navigation" }, h("a", { href: "#about" }, "About"), h("a", { href: "#tournament" }, "Tournament")),
      h("a", { className: "nav-cta", href: "https://discord.gg/DKMRnJsqV", target: "_blank", rel: "noreferrer" }, "Join our Discord ", h(Arrow, { diagonal: true }))),
    h("main", { id: "top" },
      h("section", { className: "hero", "aria-labelledby": "hero-title" },
        h("div", { className: "hero-copy" },
          h(motion.h1, { id: "hero-title", ...enter(.08) }, "Outplay the odds.", h("br"), h("span", null, "Together.")),
          h(motion.p, { className: "hero-intro", ...enter(.18) }, "A home for the curious, the competitive, and everyone finding their way. Every great play starts somewhere."),
          h(motion.div, { className: "hero-actions", ...enter(.28) }, button("Join our Discord", "https://discord.gg/DKMRnJsqV", true), h("a", { className: "text-link", href: "#tournament" }, "Explore the tournament ", h(ArrowDown, { className: "icon", size: 15, "aria-hidden": true })))),
      h("section", { className: "intro-section", id: "about" },
        h(motion.div, { ...enter() }, sectionKicker("01", "A DIFFERENT KIND OF ADVANTAGE")),
        h(motion.div, { className: "intro-grid", ...enter(.08) }, h("h2", null, "Good games are", h("br"), "never played ", h("em", null, "alone.")), h("p", null, "ProNoobs Dota is for the players who love the game enough to keep getting better. Bring your curiosity, your big ideas, and your best self. There’s always room for one more."))),
      h("section", { className: "principles", id: "principles" },
        h("div", { className: "principles-heading" }, sectionKicker("02", "WHAT WE PLAY BY"), h("span", { className: "heading-note" }, "THE GAME IS ALWAYS EVOLVING. SO ARE WE.")),
        h("div", { className: "principle-grid" }, items.map((item, index) => principle(item, index, enter)))),
      h("section", { className: "tournament", id: "tournament", "aria-labelledby": "tournament-title" },
        h("div", { className: "tournament-copy" },
          h(motion.div, { className: "tournament-label", ...enter(.05) }, h(Trophy, { size: 17, strokeWidth: 1.7, "aria-hidden": true }), " DOTA 2 · COMMUNITY TOURNAMENT"),
          h(motion.h2, { id: "tournament-title", ...enter(.13) }, "Take your place", h("br"), h("em", null, "in the bracket.")),
          h(motion.p, { ...enter(.2) }, "Bring your team together and register through the ProNoobs Dota Discord. Event details and match updates are shared there."),
          h(motion.a, { className: "button button-tournament", href: "https://discord.gg/DKMRnJsqV", target: "_blank", rel: "noreferrer", ...enter(.27) }, "Register your team", h(ArrowUpRight, { size: 17, strokeWidth: 1.8, "aria-hidden": true }))),
      h("section", { className: "closing", "aria-labelledby": "closing-title" },
        h("div", { className: "closing-copy" }, h("p", { className: "closing-eyebrow" }, "GG, WELL PLAYED."), h("h2", { id: "closing-title" }, "See you in the lane."), h("p", { className: "closing-caption" }, "Your next match starts with the ProNoobs community.")),
        h("a", { className: "button button-primary", href: "https://discord.gg/DKMRnJsqV", target: "_blank", rel: "noreferrer" }, "Join our Discord", h(ArrowUpRight, { size: 16, strokeWidth: 1.8, "aria-hidden": true }))),
    h("footer", null,
      h("a", { className: "wordmark logo-link footer-brand", href: "#top", "aria-label": "ProNoobs Dota home" }, h("img", { className: "brand-logo footer-logo", src: "./assets/pro-noobs-ogre-logo.png", alt: "ProNoobs Dota logo featuring Ogre Magi" })),
      h("span", null, "THE NEXT BIG PLAY STARTS HERE."), h("span", null, "© PRONOOBS DOTA")));
}

createRoot(document.getElementById("root")).render(h(App));

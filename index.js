import React from "https://esm.sh/react@19.1.0";
import { createRoot } from "https://esm.sh/react-dom@19.1.0/client?external=react";
import { motion, useReducedMotion } from "https://esm.sh/framer-motion@12.23.12?external=react";
import { ArrowDown, ArrowRight, ArrowUpRight, Map, UsersRound, Swords, Trophy } from "https://esm.sh/lucide-react?external=react";
import { SocialIcon } from "https://esm.sh/react-social-icons@6.27.0?external=react";

const h = React.createElement;
const Arrow = ({ diagonal = false }) => h(diagonal ? ArrowUpRight : ArrowRight, { "aria-hidden": true, className: "icon", size: 16, strokeWidth: 1.8 });
const DiscordIcon = () => h(SocialIcon, { as: "span", network: "discord", className: "discord-button-icon", bgColor: "transparent", fgColor: "currentColor", borderRadius: "0", "aria-hidden": true, style: { width: 18, height: 18 } });
const items = [
  { label: "Read the map", copy: "Spot the opening. Pick the moment. Set the pace.", icon: Map },
  { label: "Fight as one", copy: "Good calls become great plays when the team moves together.", icon: UsersRound },
  { label: "Take the opening", copy: "Turn one good moment into a fight worth remembering.", icon: Swords },
];
const sectionKicker = (number, label) => h("div", { className: "section-kicker" }, h("span", null, number), h("i"), ` ${label}`);
const button = (label, href, diagonal = false) => h("a", { className: "button button-primary discord-button", href, target: "_blank", rel: "noreferrer" }, h(DiscordIcon), label, h(Arrow, { diagonal }));
const principle = (item, index, enter) => h(motion.article, { className: "principle-card glass-panel", key: item.label, ...enter(index) },
  h("div", { className: "principle-icon" }, h(item.icon, { "aria-hidden": true, size: 21, strokeWidth: 1.7 })),
  h("h3", null, item.label), h("p", null, item.copy));

function App() {
  const reduceMotion = useReducedMotion();
  const scrollReveal = (index = 0) => {
    if (reduceMotion) return {};
    const poses = [
      { y: 34, opacity: 0 },
      { x: -30, opacity: 0 },
      { x: 30, opacity: 0 },
      { y: 24, scale: .96, opacity: 0 },
    ];
    return {
      initial: poses[index % poses.length],
      whileInView: { x: 0, y: 0, scale: 1, opacity: 1 },
      viewport: { once: true, amount: .22 },
      transition: { duration: .72, delay: (index % 3) * .09, ease: [.22, 1, .36, 1] },
    };
  };
  const enter = (delay = 0) => reduceMotion ? {} : {
    initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 },
    transition: { duration: .7, delay, ease: [.22, 1, .36, 1] },
  };
  return h("div", { className: "site-shell" },
    h("header", { className: "topbar" },
      h("a", { className: "wordmark logo-link", href: "#top", "aria-label": "ProNoobs Dota home" }, h("img", { className: "brand-logo", src: "./assets/pro-noobs-ogre-logo.webp", alt: "ProNoobs Dota logo featuring Ogre Magi" })),
      h("nav", { "aria-label": "Main navigation" }, h("a", { href: "#about" }, "About"), h("a", { href: "#tournament" }, "Tournament")),
      h("a", { className: "nav-cta discord-button", href: "https://discord.gg/DKMRnJsqV", target: "_blank", rel: "noreferrer" }, h(DiscordIcon), "Join our Discord ", h(Arrow, { diagonal: true }))),
    h("main", { id: "top" },
      h("section", { className: "hero", "aria-labelledby": "hero-title" },
        h("div", { className: "hero-copy" },
          h(motion.h1, { id: "hero-title", ...enter(.08) }, "Outplay the odds.", h("br"), h("span", null, "Together.")),
          h(motion.p, { className: "hero-intro", ...enter(.18) }, "A home for the curious, the competitive, and everyone finding their way. Every great play starts somewhere."),
          h(motion.div, { className: "hero-actions", ...enter(.28) }, button("Join our Discord", "https://discord.gg/DKMRnJsqV", true), h("a", { className: "text-link", href: "#tournament" }, "Explore the tournament ", h(ArrowDown, { className: "icon", size: 15, "aria-hidden": true })))),
      h("section", { className: "intro-section", id: "about" },
        h(motion.div, { ...scrollReveal(0) }, sectionKicker("01", "A DIFFERENT KIND OF ADVANTAGE")),
        h(motion.div, { className: "intro-grid", ...scrollReveal(1) }, h("h2", null, "Good games are", h("br"), "never played ", h("em", null, "alone.")), h("p", null, "ProNoobs Dota is for the players who love the game enough to keep getting better. Bring your curiosity, your big ideas, and your best self. There’s always room for one more."))),
      h("section", { className: "principles", id: "principles" },
        h(motion.div, { className: "principles-heading", ...scrollReveal(2) }, sectionKicker("02", "WHAT WE PLAY BY"), h("span", { className: "heading-note" }, "THE GAME IS ALWAYS EVOLVING. SO ARE WE.")),
        h("div", { className: "principle-grid" }, items.map((item, index) => principle(item, index, scrollReveal)))),
      h("section", { className: "tournament", id: "tournament", "aria-labelledby": "tournament-title" },
        h("div", { className: "tournament-copy" },
          h(motion.div, { className: "tournament-label", ...scrollReveal(0) }, h(Trophy, { size: 17, strokeWidth: 1.7, "aria-hidden": true }), " DOTA 2 · COMMUNITY TOURNAMENT"),
          h(motion.h2, { id: "tournament-title", ...scrollReveal(1) }, "Take your place", h("br"), h("em", null, "in the bracket.")),
          h(motion.p, { ...scrollReveal(2) }, "Got a full five, or still recruiting? Start your team in Discord with the players you have, register, and fill the rest in later."),
          h(motion.a, { className: "button button-tournament discord-button", href: "https://discord.gg/jRNRJW9A7", target: "_blank", rel: "noreferrer", ...scrollReveal(3) }, h(DiscordIcon), "Register your team", h(ArrowUpRight, { size: 17, strokeWidth: 1.8, "aria-hidden": true }))),
      h("section", { className: "closing", "aria-labelledby": "closing-title" },
        h(motion.div, { className: "closing-copy", ...scrollReveal(0) }, h("p", { className: "closing-eyebrow" }, "GG, WELL PLAYED."), h("h2", { id: "closing-title" }, "See you in the lane."), h("p", { className: "closing-caption" }, "Your next match starts with the ProNoobs community.")),
        h(motion.a, { className: "button button-primary discord-button", href: "https://discord.gg/DKMRnJsqV", target: "_blank", rel: "noreferrer", ...scrollReveal(1) }, h(DiscordIcon), "Join our Discord", h(ArrowUpRight, { size: 16, strokeWidth: 1.8, "aria-hidden": true }))),
    h("footer", null,
      h("a", { className: "wordmark logo-link footer-brand", href: "#top", "aria-label": "ProNoobs Dota home" }, h("img", { className: "brand-logo footer-logo", src: "./assets/pro-noobs-ogre-logo.webp", alt: "ProNoobs Dota logo featuring Ogre Magi" })),
      h("span", null, "THE NEXT BIG PLAY STARTS HERE."), h("span", null, "© PRONOOBS DOTA")));
}

createRoot(document.getElementById("root")).render(h(App));

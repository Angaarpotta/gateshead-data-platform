/* ============================================================
   App.js — main entry, scroll handling, typing animation
   Gateshead Data Platform Portfolio
   ============================================================ */

import { initPipeline } from './pipeline.js';
import { initDashboard } from './dashboard.js';
import { initQuality } from './quality.js';
import { initCodelab } from './codelab.js';
import { initArchitecture } from './architecture.js';
import { initGovernance } from './governance.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initTypingAnimation();
  initScrollReveal();

  // small delay so the page paints first — looks snappier
  requestAnimationFrame(() => {
    initPipeline();
    initDashboard();
    initQuality();
    initCodelab();
    initArchitecture();
    initGovernance();
  });
});

/* --- Navigation --- */
function initNavigation() {
  const nav = document.getElementById('main-nav');
  const links = document.querySelectorAll('.nav-links a');
  const hamburger = document.querySelector('.nav-hamburger');
  const navLinksContainer = document.querySelector('.nav-links');
  const sections = document.querySelectorAll('section[id]');

  // scroll shadow
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  });

  // smooth scroll links
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').slice(1);
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
      // close mobile menu
      navLinksContainer.classList.remove('open');
    });
  });

  // hamburger toggle
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      navLinksContainer.classList.toggle('open');
    });
  }

  // active section highlighting
  const observerOpts = {
    root: null,
    rootMargin: '-30% 0px -60% 0px',
    threshold: 0
  };

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        links.forEach(l => l.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-links a[href="#${id}"]`);
        if (activeLink) activeLink.classList.add('active');
      }
    });
  }, observerOpts);

  sections.forEach(s => sectionObserver.observe(s));
}

/* --- Typing Animation --- */
function initTypingAnimation() {
  const el = document.getElementById('hero-typing');
  if (!el) return;

  const phrases = [
    'Building data infrastructure that improves lives across Gateshead.',
    'Turning raw council data into actionable insights.',
    'Designing pipelines. Championing governance. Driving outcomes.'
  ];

  let phraseIdx = 0;
  let charIdx = 0;
  let deleting = false;
  let pauseTimer = null;

  function tick() {
    const current = phrases[phraseIdx];

    if (!deleting) {
      // typing forward
      el.textContent = current.substring(0, charIdx + 1);
      charIdx++;

      if (charIdx === current.length) {
        // pause at end of phrase before deleting
        pauseTimer = setTimeout(() => {
          deleting = true;
          tick();
        }, 2400);
        return;
      }
      // slightly irregular speed — feels more human
      setTimeout(tick, 38 + Math.random() * 45);
    } else {
      // deleting
      el.textContent = current.substring(0, charIdx - 1);
      charIdx--;

      if (charIdx === 0) {
        deleting = false;
        phraseIdx = (phraseIdx + 1) % phrases.length;
        setTimeout(tick, 400);
        return;
      }
      setTimeout(tick, 18 + Math.random() * 15);
    }
  }

  // kick it off after a short delay
  setTimeout(tick, 800);
}

/* --- Scroll Reveal --- */
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal-on-scroll');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target); // only once
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -40px 0px'
  });

  reveals.forEach(el => observer.observe(el));
}

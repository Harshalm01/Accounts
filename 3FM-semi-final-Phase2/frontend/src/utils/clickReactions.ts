/**
 * Click Reactions Utility
 * Adds visual ripple and burst effects on element clicks
 */

export type ReactionType = 'ripple' | 'burst' | 'both';

interface ClickReactionConfig {
  type: ReactionType;
  color?: string;
  duration?: number;
}

export const clickReactions = {
  /**
   * Create a ripple effect from click point
   */
  createRipple: (element: HTMLElement, options: ClickReactionConfig = { type: 'ripple' }) => {
    const rect = element.getBoundingClientRect();
    const circle = document.createElement('span');

    circle.style.position = 'absolute';
    circle.style.borderRadius = '50%';
    circle.style.pointerEvents = 'none';
    circle.style.backgroundColor = options.color || 'rgba(255, 255, 255, 0.5)';
    circle.style.animation = 'clickRipple 0.6s ease-out forwards';
    circle.style.width = '20px';
    circle.style.height = '20px';

    // Position at click point (relative to element)
    circle.style.left = `${element.offsetWidth / 2 - 10}px`;
    circle.style.top = `${element.offsetHeight / 2 - 10}px`;

    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.appendChild(circle);

    // Remove element after animation
   setTimeout(() => circle.remove(), 600);
  },

  /**
   * Create a burst effect with multiple particles
   */
  createBurst: (element: HTMLElement, options: ClickReactionConfig = { type: 'burst' }) => {
    const particleCount = 6;
    const colors = [
      options.color || '#6366f1',
      '#ec4899',
      '#f97316',
      '#06b6d4',
      '#8b5cf6',
      '#10b981',
    ];

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('span');
      const angle = (i / particleCount) * Math.PI * 2;
      const velocity = 100;
      const vx = Math.cos(angle) * velocity;
      const vy = Math.sin(angle) * velocity;
      const color = colors[i % colors.length];

      particle.style.position = 'fixed';
      particle.style.width = '8px';
      particle.style.height = '8px';
      particle.style.borderRadius = '50%';
      particle.style.backgroundColor = color;
      particle.style.pointerEvents = 'none';
      particle.style.left = `${element.offsetLeft + element.offsetWidth / 2}px`;
      particle.style.top = `${element.offsetTop + element.offsetHeight / 2}px`;
      particle.style.zIndex = '9999';

      document.body.appendChild(particle);

      // Animate particle
      let x = 0;
      let y = 0;
      let opacity = 1;
      let size = 8;
      const startTime = Date.now();
      const duration = 800;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;

        if (progress > 1) {
          particle.remove();
          return;
        }

        x += vx * 0.016; // approximate deltaTime
        y += vy * 0.016;
        opacity = 1 - progress;
        size = 8 + progress * 4;

        particle.style.transform = `translate(${x}px, ${y}px)`;
        particle.style.opacity = opacity.toString();
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;

        requestAnimationFrame(animate);
      };

      animate();
    }
  },

  /**
   * Combined ripple + burst effect
   */
  createBoth: (
    element: HTMLElement,
    options: ClickReactionConfig = { type: 'both' }
  ) => {
    clickReactions.createRipple(element, options);
    clickReactions.createBurst(element, options);
  },

  /**
   * Initialize click reactions on all buttons with data-click-reaction attribute
   */
  initializeElements: (selector: string = '[data-click-reaction]') => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const reactionType = (htmlEl.dataset.clickReaction as ReactionType) || 'ripple';
      const reactionColor = htmlEl.dataset.clickColor;

      htmlEl.addEventListener('click', (e) => {
        const clickEvent = e as PointerEvent;
        const rect = htmlEl.getBoundingClientRect();

        // Only trigger if click is within element bounds
        if (
          clickEvent.clientX >= rect.left &&
          clickEvent.clientX <= rect.right &&
          clickEvent.clientY >= rect.top &&
          clickEvent.clientY <= rect.bottom
        ) {
          const options: ClickReactionConfig = {
            type: reactionType,
            color: reactionColor,
          };

          switch (reactionType) {
            case 'ripple':
              clickReactions.createRipple(htmlEl, options);
              break;
            case 'burst':
              clickReactions.createBurst(htmlEl, options);
              break;
            case 'both':
              clickReactions.createBoth(htmlEl, options);
              break;
          }
        }
      });
    });
  },
};

// Auto-initialize on page load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    clickReactions.initializeElements();
  });
}

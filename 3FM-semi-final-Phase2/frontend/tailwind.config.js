/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'blob': 'blob 7s infinite',
        'float': 'float 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.8s ease-in',
        'gradient': 'gradient 3s ease infinite',
        'shake': 'shake 0.5s ease-in-out',
        'cube-spin': 'cubeSpin 2.5s ease-in-out infinite',
        'float-3d': 'float3d 3s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out forwards',
        'click-ripple': 'clickRipple 0.6s ease-out forwards',
        'click-burst': 'clickBurst 0.8s ease-out forwards',
      },
      keyframes: {
        blob: {
          '0%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
          '33%': {
            transform: 'translate(30px, -50px) scale(1.1)',
          },
          '66%': {
            transform: 'translate(-20px, 20px) scale(0.9)',
          },
          '100%': {
            transform: 'translate(0px, 0px) scale(1)',
          },
        },
        float: {
          '0%, 100%': {
            transform: 'translateY(0px)',
          },
          '50%': {
            transform: 'translateY(-20px)',
          },
        },
        fadeIn: {
          '0%': {
            opacity: '0',
            transform: 'translateY(10px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        gradient: {
          '0%, 100%': {
            backgroundSize: '200% 200%',
            backgroundPosition: 'left center',
          },
          '50%': {
            backgroundSize: '200% 200%',
            backgroundPosition: 'right center',
          },
        },
        shake: {
          '0%, 100%': {
            transform: 'translateX(0)',
          },
          '25%': {
            transform: 'translateX(-10px)',
          },
          '75%': {
            transform: 'translateX(10px)',
          },
        },
        cubeSpin: {
          '0%': {
            transform: 'rotateX(0deg) rotateY(0deg)',
          },
          '50%': {
            transform: 'rotateX(180deg) rotateY(90deg)',
          },
          '100%': {
            transform: 'rotateX(360deg) rotateY(360deg)',
          },
        },
        float3d: {
          '0%, 100%': {
            transform: 'translateY(0px) rotateX(0deg)',
          },
          '50%': {
            transform: 'translateY(-10px) rotateX(5deg)',
          },
        },
        slideIn: {
          '0%': {
            transform: 'translateX(400px)',
            opacity: '0',
          },
          '100%': {
            transform: 'translateX(0)',
            opacity: '1',
          },
        },
        clickRipple: {
          '0%': {
            transform: 'scale(0)',
            opacity: '1',
          },
          '100%': {
            transform: 'scale(2)',
            opacity: '0',
          },
        },
        clickBurst: {
          '0%': {
            transform: 'scale(1)',
            opacity: '1',
          },
          '50%': {
            opacity: '1',
          },
          '100%': {
            transform: 'scale(1.5)',
            opacity: '0',
          },
        },
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07111f",
        mist: "#d9e7f5",
        line: "rgba(217, 231, 245, 0.12)",
        panel: "rgba(7, 17, 31, 0.72)",
        accent: "#7dd3fc",
        accent2: "#f59e0b"
      },
      boxShadow: {
        soft: "0 20px 60px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};

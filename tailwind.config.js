/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#000000",
        mist: "#f7f7f4",
        line: "rgba(255, 255, 255, 0.14)",
        panel: "#000000",
        accent: "#ffffff",
        accent2: "#f59e0b"
      },
      boxShadow: {
        soft: "0 20px 60px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};

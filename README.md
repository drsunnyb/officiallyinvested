# Dr. Sandeep Bansal - Officially Invested

A modern, responsive website for Dr. Sandeep Bansal's investment community and educational platform.

## 🚀 Features

- **Responsive Design**: Optimized for all devices with mobile-first approach
- **Modern UI**: Built with React, TypeScript, and Tailwind CSS
- **Performance Optimized**: Fast loading with Vite build system
- **SEO Ready**: Proper meta tags and semantic HTML structure

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS with custom fonts (Playfair Display, Open Sans, Caveat)
- **Build Tool**: Vite
- **Icons**: Lucide React
- **Deployment**: Netlify ready

## 📦 Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd officially-invested
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## 🚀 Deployment

### Netlify Deployment

1. **Automatic Deployment** (Recommended):
   - Connect your GitHub repository to Netlify
   - Build command: `npm run build`
   - Publish directory: `dist`
   - The `_redirects` file is included for proper SPA routing

2. **Manual Deployment**:
   - Run `npm run build`
   - Upload the `dist` folder to Netlify

### Environment Variables

No environment variables are required for basic deployment.

## 📁 Project Structure

```
src/
├── App.tsx          # Main application component
├── main.tsx         # Application entry point
├── index.css        # Global styles and Tailwind imports
└── vite-env.d.ts    # Vite type definitions

public/
├── images/          # Static images
└── _redirects       # Netlify routing configuration
```

## 🎨 Design Features

- **Custom Fonts**: Playfair Display for headings, Open Sans for body text
- **Color Scheme**: Navy blue (#0A2540) and gold (#FFD700) theme
- **Responsive Layout**: Mobile-first design with breakpoints
- **Interactive Elements**: Hover states and smooth transitions
- **Instagram Integration**: Social media feed display

## 📱 Sections

1. **Hero Section**: Introduction with background image
2. **Journey Section**: Dr. Bansal's investment story
3. **Podcast Section**: YouTube integration and guest highlights
4. **Community Section**: Educational platform features
5. **Investment Opportunities**: Available investment options
6. **Footer**: Contact information and Instagram feed

## 🔧 Customization

### Fonts
The project uses Google Fonts loaded in `src/index.css`:
- Playfair Display (headings)
- Open Sans (body text)
- Caveat (handwriting style)

### Colors
Main colors defined in Tailwind config:
- Primary: `#0A2540` (Navy)
- Accent: `#FFD700` (Gold)

### Images
- Hero image: `/images/99C8F9E7-1CBC-48EC-9C16-AA2D485CF5EF_1_105_c.jpeg`
- Instagram feed: `/images/instagram/` directory

## 📄 License

All rights reserved © Dr. Sandeep Bansal

## 🤝 Contributing

This is a private project. For any changes or suggestions, please contact the development team.

---

Built with ❤️ using React, TypeScript, and Tailwind CSS
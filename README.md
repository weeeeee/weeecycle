# Weeecycle - Professional Bike Mechanic & The Garage

A modern, fully-featured website for a professional bike mechanic shop featuring a blog/vlog platform called "The Garage".

## 🚲 About Weeecycle

Weeecycle.net is a professional bike repair and maintenance website with two main components:

1. **Main Business Site** - Showcase your bike mechanic services and expertise
2. **The Garage** - A dedicated blog/vlog platform for cycling content, tutorials, reviews, and community engagement

## 📋 Features

### Pages Included

- **Home** (`/`) - Hero section, services preview, The Garage teaser, why choose us section, and CTA
- **Services** (`/services`) - Detailed service offerings including:
  - Tune-ups & Maintenance
  - Repairs & Restoration
  - Upgrades & Customization
  - Specialized Services
  - Pricing information

- **The Garage** (`/garage`) - Blog/vlog hub with:
  - Category filtering (Tutorial, Review, Vlog)
  - Sample blog posts
  - Coming soon section for video content
  - Email subscription form
  - About section

- **Contact** (`/contact`) - Contact form and information:
  - Contact information
  - Business hours
  - Interactive contact form
  - Map placeholder

### Components

- **Header** - Navigation with responsive mobile menu
- **Footer** - Quick links and contact information

## 🛠 Tech Stack

- **Framework**: Next.js 16 with TypeScript
- **Styling**: Tailwind CSS
- **UI**: Responsive, mobile-first design
- **Features**: Server-side rendering, API routes ready

## 📦 Installation & Setup

1. **Prerequisites**:
   - Node.js 18.20.4+ (20.9.0+ recommended)
   - npm or yarn

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```
   Visit http://localhost:3000

4. **Build for production**:
   ```bash
   npm run build
   npm start
   ```

## 📁 Project Structure

```
src/
├── app/
│   ├── page.tsx              # Home page
│   ├── layout.tsx            # Root layout with Header/Footer
│   ├── globals.css           # Global styles
│   ├── services/
│   │   └── page.tsx          # Services page
│   ├── garage/
│   │   └── page.tsx          # The Garage blog page
│   └── contact/
│       └── page.tsx          # Contact page
├── components/
│   ├── Header.tsx            # Navigation component
│   └── Footer.tsx            # Footer component
public/                        # Static assets
package.json
tsconfig.json
next.config.ts
tailwind.config.ts
```

## 🎨 Customization Guide

### Update Contact Information

Edit `/src/components/Footer.tsx` and `/src/app/contact/page.tsx`:
- Phone number
- Email address
- Business location
- Hours of operation

### Add Blog Posts

In `/src/app/garage/page.tsx`, add new posts to the `posts` array:

```typescript
{
  id: 7,
  title: 'Your Post Title',
  category: 'tutorial', // or 'review', 'vlog'
  date: 'Jan 20, 2025',
  excerpt: 'Brief description of the post',
  icon: '🔧', // or any emoji
},
```

### Modify Services

Update the services grid in `/src/app/services/page.tsx` to match your offerings.

### Colors & Branding

- Primary color: Yellow (`yellow-400`)
- Dark theme: Gray (`gray-900`)
- Accent: Light Gray (`gray-100`)

Edit Tailwind classes in components to change the color scheme.

## 🚀 Deployment

### Deploy to Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Click Deploy
4. Your site will be live!

### Deploy to Other Platforms

Works with any platform supporting Node.js/Next.js:
- Netlify
- AWS
- Digital Ocean
- Railway
- etc.

## 📧 Contact Form Setup

The contact form currently logs data to console. To make it functional:

1. **Using Vercel + Resend** (recommended):
   - Install: `npm install resend`
   - Create an API route
   - Update the form to send data to your endpoint

2. **Using EmailJS**:
   - Sign up at emailjs.com
   - Add your service ID
   - Update the form handler

3. **Using a backend service**:
   - Create an API endpoint
   - Update form submission to call your API

## 🎯 Next Steps

1. **Customize colors** - Match your brand identity
2. **Add real content** - Replace sample text with your information
3. **Add images** - Add photos of your shop, bikes, team
4. **Set up forms** - Connect contact form to email service
5. **Add video embeds** - Add YouTube vlogs to The Garage
6. **Deploy** - Launch your site to the world!

## 📱 Mobile Responsive

The entire site is fully responsive and works great on:
- Desktop (1920px+)
- Laptop (1024px+)
- Tablet (768px+)
- Mobile (375px+)

## �� Security

- Built with Next.js security best practices
- Environment variables for sensitive data
- TypeScript for type safety
- Ready for SSL/HTTPS

## 📝 License

This project is ready for use by Weeecycle. Customize as needed!

## 🤝 Support

For questions or customization needs, refer to:
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

**Ready to launch your bike mechanic empire!** 🚀🚲

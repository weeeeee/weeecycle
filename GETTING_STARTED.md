# Getting Started with Weeecycle

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
Then open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Explore the Site
- Home: http://localhost:3000
- Services: http://localhost:3000/services
- The Garage: http://localhost:3000/garage
- Contact: http://localhost:3000/contact

## 🎨 Key Customizations Needed

### 1. Update Your Information
**File**: `src/components/Footer.tsx` and `src/app/contact/page.tsx`

Replace these placeholders:
- `📧 info@weeecycle.net` → Your actual email
- `📱 Your Phone Number` → Your actual phone
- `📍 Your Location` → Your actual address
- Hours of operation

### 2. Update Business Details
**File**: `src/app/services/page.tsx`

- Service descriptions
- Service pricing (currently placeholders)
- Add/remove services as needed

### 3. Add Blog Content
**File**: `src/app/garage/page.tsx`

The `posts` array contains sample posts. Add your real content:

```typescript
const posts = [
  {
    id: 1,
    title: 'Your Blog Title',
    category: 'tutorial', // 'tutorial', 'review', or 'vlog'
    date: 'Jan 15, 2025',
    excerpt: 'Brief description of your post...',
    icon: '📚', // Choose an emoji
  },
  // Add more posts here...
];
```

### 4. Customize Colors
All styling uses Tailwind CSS classes. Main colors:
- **Yellow (Primary)**: `yellow-400` - Change in Header, CTA buttons, accents
- **Dark Gray (Background)**: `gray-900` - Change in Header, Footer
- **Light Gray (Section BG)**: `gray-100` - Change section backgrounds

To change the color scheme globally, find and replace these Tailwind classes throughout the components.

## 📝 File Guide

```
src/
├── app/
│   ├── page.tsx                    # Home page - Hero, services, The Garage intro
│   ├── layout.tsx                  # Main layout with Header & Footer
│   ├── services/page.tsx           # Services listing and details
│   ├── garage/page.tsx             # Blog/vlog hub with filtering
│   └── contact/page.tsx            # Contact form and info
├── components/
│   ├── Header.tsx                  # Navigation bar
│   └── Footer.tsx                  # Footer with links & contact
```

## 🔗 Navigation Structure

- **Home** (/)
- **Services** (/services)
- **The Garage** (/garage)
- **Contact** (/contact)

## 📧 Making the Contact Form Work

Currently, the form just logs to console. To actually send emails, choose one:

### Option 1: Resend (Easiest)
1. Install: `npm install resend`
2. Sign up at [resend.com](https://resend.com)
3. Get your API key
4. Create `src/app/api/contact/route.ts`:

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const body = await request.json();
  
  const result = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: 'your-email@example.com',
    subject: `New message from ${body.name}`,
    html: `<p>${body.message}</p>`,
  });
  
  return Response.json(result);
}
```

5. Update the form to send to `/api/contact`

### Option 2: EmailJS (No Backend)
1. Sign up at [emailjs.com](https://emailjs.com)
2. Follow their tutorial
3. Update the contact form handler with EmailJS code

## 🚀 Ready to Deploy?

### Deploy to Vercel (Recommended)
1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your GitHub repo
4. Click Deploy
5. Done! Your site is live

### Other Options
- **Netlify**: Similar to Vercel
- **Railway**: `npm install -g @railway/cli`
- **AWS Amplify**: AWS dashboard

## ✅ Checklist Before Launch

- [ ] Updated all contact information
- [ ] Customized services and pricing
- [ ] Added real blog posts or removed samples
- [ ] Changed colors to match your brand
- [ ] Added photos/images to `/public` folder
- [ ] Set up email functionality
- [ ] Tested all links work
- [ ] Mobile responsive check
- [ ] Domain setup (if using custom domain)
- [ ] SSL certificate (automatic on Vercel)

## 💡 Tips

1. **Adding Images**:
   - Place in `/public` folder
   - Use in components: `<img src="/image-name.jpg" />`

2. **Styling Changes**:
   - All styles use Tailwind CSS
   - No separate CSS files needed (except globals.css)
   - Modify className attributes to change styles

3. **Links**:
   - Use `<Link>` from Next.js for internal navigation
   - Use regular `<a>` tags for external links

4. **Mobile Menu**:
   - Automatically shows hamburger menu on mobile
   - Edit Header.tsx to customize

## 🆘 Common Issues

**"npm: command not found"**
- Install Node.js from [nodejs.org](https://nodejs.org)

**"Port 3000 already in use"**
```bash
npm run dev -- -p 3001
```

**TypeScript errors**
- Usually resolve automatically
- Try: `npm install` and restart dev server

## 📚 Learn More

- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [React Docs](https://react.dev)

---

You're all set! Happy building! 🎉

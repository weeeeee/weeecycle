export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* About */}
          <div>
            <h3 className="text-lg font-bold text-yellow-400 mb-4">Weeecycle</h3>
            <p className="text-gray-300">
              Professional bike repair and maintenance services. Your one-stop shop for all things cycling.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-bold text-yellow-400 mb-4">Quick Links</h3>
            <ul className="space-y-2 text-gray-300">
              <li><a href="/services" className="hover:text-yellow-400">Services</a></li>
              <li><a href="/garage" className="hover:text-yellow-400">The Garage Blog</a></li>
              <li><a href="/contact" className="hover:text-yellow-400">Contact Us</a></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-lg font-bold text-yellow-400 mb-4">Contact</h3>
            <p className="text-gray-300">
              📧 info@weeecycle.net<br />
              📱 Your Phone Number<br />
              📍 Your Location
            </p>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400">
          <p>&copy; 2025 Weeecycle. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

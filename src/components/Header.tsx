'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-gray-900 text-white shadow-lg">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center space-x-2">
          <div className="text-2xl font-bold text-yellow-400">⚙️</div>
          <span className="text-2xl font-bold">Weeecycle</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex space-x-8">
          <Link href="/" className="hover:text-yellow-400 transition">
            Home
          </Link>
          <Link href="/services" className="hover:text-yellow-400 transition">
            Services
          </Link>
          <Link href="/garage" className="hover:text-yellow-400 transition">
            The Garage
          </Link>
          <Link href="/contact" className="hover:text-yellow-400 transition">
            Contact
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden text-yellow-400"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="absolute top-16 left-0 right-0 bg-gray-800 md:hidden">
            <div className="flex flex-col space-y-4 p-4">
              <Link href="/" className="hover:text-yellow-400 transition">
                Home
              </Link>
              <Link href="/services" className="hover:text-yellow-400 transition">
                Services
              </Link>
              <Link href="/garage" className="hover:text-yellow-400 transition">
                The Garage
              </Link>
              <Link href="/contact" className="hover:text-yellow-400 transition">
                Contact
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

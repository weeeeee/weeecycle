'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Garage() {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const posts = [
    {
      id: 1,
      title: 'Complete Guide to Bike Maintenance',
      category: 'tutorial',
      date: 'Jan 15, 2025',
      excerpt: 'Learn the essential maintenance tips to keep your bike in perfect condition year-round.',
      icon: '📚',
    },
    {
      id: 2,
      title: 'Mountain Bike vs Road Bike: Which is Right for You?',
      category: 'review',
      date: 'Jan 12, 2025',
      excerpt: 'A comprehensive comparison to help you choose the perfect bike for your cycling goals.',
      icon: '🚴',
    },
    {
      id: 3,
      title: 'DIY Brake Adjustment - Step by Step',
      category: 'tutorial',
      date: 'Jan 10, 2025',
      excerpt: 'Master the art of adjusting your bike brakes like a pro with our detailed guide.',
      icon: '🛠️',
    },
    {
      id: 4,
      title: 'My Epic Mountain Biking Adventure',
      category: 'vlog',
      date: 'Jan 8, 2025',
      excerpt: 'Check out the video from my latest trail adventure in the beautiful mountains.',
      icon: '📹',
    },
    {
      id: 5,
      title: 'Top 5 Bike Accessories Every Cyclist Needs',
      category: 'review',
      date: 'Jan 5, 2025',
      excerpt: 'Discover the must-have accessories that will improve your cycling experience.',
      icon: '✨',
    },
    {
      id: 6,
      title: 'Chain Maintenance Tips for Longevity',
      category: 'tutorial',
      date: 'Jan 1, 2025',
      excerpt: 'Keep your bike chain in perfect condition with these expert maintenance tips.',
      icon: '🔗',
    },
  ];

  const filteredPosts =
    selectedCategory === 'all'
      ? posts
      : posts.filter((post) => post.category === selectedCategory);

  return (
    <main>
      {/* Page Header */}
      <section className="bg-gradient-to-r from-yellow-400 to-yellow-300 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">The Garage</h1>
          <p className="text-gray-800 text-lg">
            Your ultimate destination for cycling blogs, tutorials, reviews, and vlogs
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Category Filter */}
          <div className="flex flex-wrap gap-4 mb-12 justify-center">
            {['all', 'tutorial', 'review', 'vlog'].map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-6 py-2 rounded-lg font-bold transition ${
                  selectedCategory === category
                    ? 'bg-yellow-400 text-gray-900'
                    : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                }`}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>

          {/* Posts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition"
              >
                <div className="bg-gradient-to-r from-yellow-400 to-yellow-300 p-8 text-center">
                  <div className="text-5xl">{post.icon}</div>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-yellow-600 bg-yellow-100 px-3 py-1 rounded-full">
                      {post.category.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500">{post.date}</span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {post.title}
                  </h3>
                  <p className="text-gray-600 mb-4">{post.excerpt}</p>
                  <button className="text-yellow-600 font-bold hover:text-yellow-700 transition">
                    Read More →
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Coming Soon Section */}
          <div className="bg-gray-100 rounded-lg p-12 text-center mb-16">
            <div className="text-6xl mb-4">🎬</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Video Content Coming Soon!
            </h2>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
              We're building out our video library with step-by-step tutorials, bike reviews, and cycling adventures. Subscribe to get notified when new content drops!
            </p>
            <input
              type="email"
              placeholder="Enter your email"
              className="px-4 py-2 rounded-lg border border-gray-300 mr-2 mb-4 sm:mb-0"
            />
            <button className="bg-yellow-400 text-gray-900 px-6 py-2 rounded-lg font-bold hover:bg-yellow-300 transition">
              Subscribe
            </button>
          </div>

          {/* About The Garage */}
          <div className="bg-white rounded-lg shadow-lg p-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">About The Garage</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-gray-600 mb-4">
                  The Garage is more than just a blog – it's a community hub for cyclists of all levels. Whether you're a weekend warrior or a serious enthusiast, you'll find content tailored to your needs.
                </p>
                <p className="text-gray-600">
                  We cover everything from practical maintenance guides and DIY tips to in-depth bike reviews and inspiring cycling stories. Our mission is to empower cyclists with knowledge and build a supportive community.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">What You'll Find:</h3>
                <ul className="space-y-3 text-gray-600">
                  <li>✓ Step-by-step maintenance tutorials</li>
                  <li>✓ Honest product reviews</li>
                  <li>✓ Trail guides and cycling stories</li>
                  <li>✓ Expert cycling tips and tricks</li>
                  <li>✓ Community spotlights</li>
                  <li>✓ Q&A with mechanics</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

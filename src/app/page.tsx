import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-gray-900 to-gray-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6">
                Welcome to <span className="text-yellow-400">Weeecycle</span>
              </h1>
              <p className="text-xl text-gray-300 mb-8">
                Your trusted partner for professional bike repair, maintenance, and cycling expertise. From casual riders to serious cyclists, we've got you covered.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/services"
                  className="bg-yellow-400 text-gray-900 px-8 py-3 rounded-lg font-bold hover:bg-yellow-300 transition text-center"
                >
                  View Services
                </Link>
                <Link
                  href="/garage"
                  className="border-2 border-yellow-400 text-yellow-400 px-8 py-3 rounded-lg font-bold hover:bg-yellow-400 hover:text-gray-900 transition text-center"
                >
                  The Garage Blog
                </Link>
              </div>
            </div>
            <div className="text-center">
              <div className="text-9xl">🚲</div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Preview */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold mb-12 text-center text-gray-900">
            Our Services
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: '🔧',
                title: 'Tune-Ups & Maintenance',
                description:
                  'Keep your bike running smoothly with our professional tune-ups and regular maintenance services.',
              },
              {
                icon: '⚡',
                title: 'Repairs & Restoration',
                description:
                  'From flat tires to complete overhauls, we repair and restore bikes to like-new condition.',
              },
              {
                icon: '🎨',
                title: 'Upgrades & Customization',
                description:
                  'Upgrade your bike with quality components and customize it to match your style.',
              },
            ].map((service, index) => (
              <div
                key={index}
                className="bg-white p-8 rounded-lg shadow-lg hover:shadow-xl transition"
              >
                <div className="text-5xl mb-4">{service.icon}</div>
                <h3 className="text-2xl font-bold mb-4 text-gray-900">
                  {service.title}
                </h3>
                <p className="text-gray-600">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Garage Section */}
      <section className="bg-gray-100 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold mb-12 text-center text-gray-900">
            The Garage
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-lg text-gray-700 mb-6">
                Welcome to <span className="font-bold text-yellow-400">The Garage</span> – your ultimate destination for cycling content, tutorials, and insights.
              </p>
              <p className="text-gray-700 mb-6">
                Whether you're looking for maintenance tips, bike reviews, or inspiring cycling stories, The Garage has it all. From written blogs to video vlogs, we cover everything you need to know about bikes and cycling.
              </p>
              <Link
                href="/garage"
                className="inline-block bg-gray-900 text-white px-8 py-3 rounded-lg font-bold hover:bg-gray-800 transition"
              >
                Explore The Garage →
              </Link>
            </div>
            <div className="text-center">
              <div className="text-8xl">📺</div>
              <p className="text-gray-700 mt-4">Blogs & Vlogs Coming Soon!</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold mb-12 text-center text-gray-900">
            Why Choose Weeecycle?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                title: 'Expert Mechanics',
                description:
                  'Our team consists of experienced and certified bike mechanics with years of expertise.',
              },
              {
                title: 'Quality Parts',
                description:
                  'We use only high-quality, reliable parts for all repairs and upgrades.',
              },
              {
                title: 'Educational Content',
                description:
                  'Learn from our blog and vlogs in The Garage – become a better cyclist.',
              },
              {
                title: 'Community Focused',
                description:
                  'We believe in building a strong cycling community and supporting local riders.',
              },
            ].map((item, index) => (
              <div key={index} className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-yellow-400 text-gray-900">
                    ✓
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {item.title}
                  </h3>
                  <p className="text-gray-600">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to Get Your Bike Service?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Contact us today to schedule an appointment or ask any questions.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-yellow-400 text-gray-900 px-8 py-3 rounded-lg font-bold hover:bg-yellow-300 transition"
          >
            Contact Us
          </Link>
        </div>
      </section>
    </main>
  );
}

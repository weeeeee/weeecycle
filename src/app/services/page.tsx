import Link from 'next/link';

export default function Services() {
  return (
    <main>
      {/* Page Header */}
      <section className="bg-gradient-to-r from-gray-900 to-gray-800 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4">Our Services</h1>
          <p className="text-gray-300">Professional bike repair and maintenance services for all types of bikes</p>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
            {/* Tune-Ups & Maintenance */}
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="text-6xl mb-6">🔧</div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Tune-Ups & Maintenance
              </h2>
              <p className="text-gray-600 mb-4">
                Keep your bike in top condition with our comprehensive tune-up services. We handle everything from cable adjustments to derailer tuning.
              </p>
              <ul className="space-y-2 text-gray-700">
                <li>✓ Basic tune-up</li>
                <li>✓ Drivetrain cleaning & lubrication</li>
                <li>✓ Brake adjustment</li>
                <li>✓ Gear adjustment</li>
                <li>✓ Wheel truing</li>
                <li>✓ Chain replacement</li>
              </ul>
            </div>

            {/* Repairs & Restoration */}
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="text-6xl mb-6">⚡</div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Repairs & Restoration
              </h2>
              <p className="text-gray-600 mb-4">
                From minor fixes to complete overhauls, we restore bikes to their former glory. No bike is too damaged!
              </p>
              <ul className="space-y-2 text-gray-700">
                <li>✓ Flat tire repair</li>
                <li>✓ Spoke replacement</li>
                <li>✓ Bottom bracket service</li>
                <li>✓ Headset service</li>
                <li>✓ Frame repair</li>
                <li>✓ Complete rebuild</li>
              </ul>
            </div>

            {/* Upgrades & Customization */}
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="text-6xl mb-6">🎨</div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Upgrades & Customization
              </h2>
              <p className="text-gray-600 mb-4">
                Want to enhance your bike's performance or style? We offer a wide range of quality upgrades and custom modifications.
              </p>
              <ul className="space-y-2 text-gray-700">
                <li>✓ Component upgrades</li>
                <li>✓ Custom paint jobs</li>
                <li>✓ Handlebar swaps</li>
                <li>✓ Seat upgrades</li>
                <li>✓ Drivetrain upgrades</li>
                <li>✓ Custom builds</li>
              </ul>
            </div>

            {/* Specialized Services */}
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="text-6xl mb-6">🚴</div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Specialized Services
              </h2>
              <p className="text-gray-600 mb-4">
                We specialize in all types of bikes and have expertise in servicing mountain bikes, road bikes, BMX, and more.
              </p>
              <ul className="space-y-2 text-gray-700">
                <li>✓ Suspension service</li>
                <li>✓ Disc brake service</li>
                <li>✓ Cable & housing replacement</li>
                <li>✓ Bike fitting</li>
                <li>✓ Pre-ride safety checks</li>
                <li>✓ Custom adjustments</li>
              </ul>
            </div>
          </div>

          {/* Pricing Section */}
          <div className="bg-gray-100 rounded-lg p-8 mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
              Service Pricing
            </h2>
            <p className="text-gray-600 text-center mb-8">
              Prices vary based on the specific service and your bike type. Contact us for a detailed quote!
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { service: 'Basic Tune-Up', price: '$35-50' },
                { service: 'Flat Tire Repair', price: '$10-20' },
                { service: 'Complete Overhaul', price: '$150+' },
              ].map((item, index) => (
                <div key={index} className="bg-white p-6 rounded-lg text-center">
                  <h3 className="font-bold text-gray-900 mb-2">{item.service}</h3>
                  <p className="text-yellow-400 text-2xl font-bold">{item.price}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              Ready to Get Your Bike Serviced?
            </h2>
            <Link
              href="/contact"
              className="inline-block bg-yellow-400 text-gray-900 px-8 py-3 rounded-lg font-bold hover:bg-yellow-300 transition"
            >
              Contact Us Today
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

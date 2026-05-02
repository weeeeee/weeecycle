import re

with open('intake.html', 'r') as f:
    content = f.read()

# Replace HTML from field-frame to field-tires
html_replacement = """                                    <!-- Frame -->
                                    <div class="spec-field transition-all duration-500" id="field-specific-frame">
                                        <label class="block text-gray-400 text-xs uppercase tracking-wider mb-2">Select Your Frame</label>
                                        <div class="grid grid-cols-2 gap-4" id="specific-frame-grid"></div>
                                    </div>

                                    <!-- Handlebar -->
                                    <div class="spec-field hidden opacity-0 transition-all duration-500 mt-6" id="field-specific-handlebar">
                                        <label class="block text-gray-400 text-xs uppercase tracking-wider mb-2">Select Your Handlebar</label>
                                        <div class="grid grid-cols-2 gap-4" id="specific-handlebar-grid"></div>
                                    </div>

                                    <!-- Stem -->
                                    <div class="spec-field hidden opacity-0 transition-all duration-500 mt-6" id="field-specific-stem">
                                        <label class="block text-gray-400 text-xs uppercase tracking-wider mb-2">Select Your Stem</label>
                                        <div class="grid grid-cols-2 gap-4" id="specific-stem-grid"></div>
                                    </div>

                                    <!-- Wheelset -->
                                    <div class="spec-field hidden opacity-0 transition-all duration-500 mt-6" id="field-specific-wheelset">
                                        <label class="block text-gray-400 text-xs uppercase tracking-wider mb-2">Select Your Wheelset</label>
                                        <div class="grid grid-cols-2 gap-4" id="specific-wheelset-grid"></div>
                                    </div>

                                    <!-- Groupset -->
                                    <div class="spec-field hidden opacity-0 transition-all duration-500 mt-6" id="field-specific-groupset">
                                        <label class="block text-gray-400 text-xs uppercase tracking-wider mb-2">Select Your Groupset</label>
                                        <div class="grid grid-cols-2 gap-4" id="specific-groupset-grid"></div>
                                    </div>

                                    <!-- Seatpost -->
                                    <div class="spec-field hidden opacity-0 transition-all duration-500 mt-6" id="field-specific-seatpost">
                                        <label class="block text-gray-400 text-xs uppercase tracking-wider mb-2">Select Your Seatpost</label>
                                        <div class="grid grid-cols-2 gap-4" id="specific-seatpost-grid"></div>
                                    </div>

                                    <!-- Saddle -->
                                    <div class="spec-field hidden opacity-0 transition-all duration-500 mt-6" id="field-specific-saddle">
                                        <label class="block text-gray-400 text-xs uppercase tracking-wider mb-2">Select Your Saddle</label>
                                        <div class="grid grid-cols-2 gap-4" id="specific-saddle-grid"></div>
                                    </div>

                                    <!-- Tires -->
                                    <div class="spec-field hidden opacity-0 transition-all duration-500 mt-6" id="field-specific-tires">
                                        <label class="block text-gray-400 text-xs uppercase tracking-wider mb-2">Select Your Tires</label>
                                        <div class="grid grid-cols-2 gap-4" id="specific-tires-grid"></div>
                                    </div>"""

content = re.sub(r'<!-- Frame -->.*?<!-- Other -->', html_replacement + '\n\n                                    <!-- Other -->', content, flags=re.DOTALL)

# Replace JS logic
js_replacement = """
        // State for components
        const componentChoices = {
            frame: "",
            handlebar: "",
            stem: "",
            wheelset: "",
            groupset: "",
            seatpost: "",
            saddle: "",
            tires: ""
        };

        const categories = Object.keys(componentChoices);

        // Check for URL params to prefill service (kept for compatibility, though we jump to step 2 now)
        window.onload = function () {
            const urlParams = new URLSearchParams(window.location.search);
            const service = urlParams.get('service');
            if (service) {
                // If service is passed, we could pre-fill something, but for now we just let them start at step 1
                // or optionally jump to step 2 if we wanted, but rider details are always needed.
            }
            
            // Load dynamic frames from dashboard config
            loadCustomComponents();
        }

        function loadCustomComponents() {
            const stored = localStorage.getItem('intake_components_config');
            let config = {};
            if (stored) {
                config = JSON.parse(stored);
            } else {
                // Fallback to defaults
                config = {
                    frame: [
                        { id: '1', name: 'Aero Carbon Mk1', image: '/images/alloy_placeholder.png', url: '#' },
                        { id: '2', name: 'Endurance Pro', image: '/images/alloy_placeholder.png', url: '#' }
                    ],
                    handlebar: [{ id: '1', name: 'Carbon Drop Bars', image: '/images/placeholder_handlebar.png', url: '#' }],
                    stem: [{ id: '1', name: 'Alloy Stem', image: '/images/placeholder_stem.png', url: '#' }],
                    wheelset: [{ id: '1', name: 'Aero Carbon Wheels', image: '/images/placeholder_wheelset.png', url: '#' }],
                    groupset: [{ id: '1', name: 'Electronic Groupset', image: '/images/placeholder_groupset.png', url: '#' }],
                    seatpost: [{ id: '1', name: 'Carbon Seatpost', image: '/images/placeholder_seatpost.png', url: '#' }],
                    saddle: [{ id: '1', name: 'Racing Saddle', image: '/images/placeholder_saddle.png', url: '#' }],
                    tires: [{ id: '1', name: 'Tan Wall Tires', image: '/images/placeholder_tires.png', url: '#' }]
                };
            }
            
            categories.forEach(cat => {
                const grid = document.getElementById('specific-' + cat + '-grid');
                if (!grid) return;
                
                grid.innerHTML = '';
                const items = config[cat] || [];
                
                if (items.length === 0) {
                    grid.innerHTML = '<div class="col-span-2 text-gray-500 text-sm">No items configured. Please use Workshop Dashboard.</div>';
                }

                items.forEach(item => {
                    const safeName = item.name.replace(/'/g, "\\'");
                    grid.innerHTML += `
                        <div class="component-card bg-brand-dark border border-gray-700 rounded-lg p-3 flex flex-col gap-2 transition hover:border-brand-orange cursor-pointer" 
                             onclick="selectSpecificComponent('${cat}', '${safeName}', this)">
                            <img src="${item.image}" alt="${item.name}" class="w-full h-32 object-cover rounded bg-gray-800">
                            <div class="text-white font-bold text-sm">${item.name}</div>
                            <a href="${item.url}" target="_blank" class="text-xs text-blue-400 hover:text-blue-300" onclick="event.stopPropagation()">View on Amazon</a>
                            <button type="button" class="mt-auto bg-gray-700 text-white text-xs py-2 rounded hover:bg-brand-orange transition select-btn">Select</button>
                        </div>
                    `;
                });
            });
        }

        function selectSpecificComponent(category, itemName, element) {
            componentChoices[category] = itemName;
            
            // Visual highlight for the selected card within this category
            const grid = document.getElementById('specific-' + category + '-grid');
            grid.querySelectorAll('.component-card').forEach(card => {
                card.classList.remove('ring-2', 'ring-brand-orange');
                card.querySelector('.select-btn').classList.remove('bg-brand-orange');
                card.querySelector('.select-btn').classList.add('bg-gray-700');
                card.querySelector('.select-btn').textContent = 'Select';
            });
            element.classList.add('ring-2', 'ring-brand-orange');
            element.querySelector('.select-btn').classList.remove('bg-gray-700');
            element.querySelector('.select-btn').classList.add('bg-brand-orange');
            element.querySelector('.select-btn').textContent = 'Selected';

            // Highlight SVG part
            const svgPart = document.getElementById('svg-' + category);
            if (svgPart) {
                svgPart.classList.add('highlight');
            }

            // Show next category grid
            const currentIndex = categories.indexOf(category);
            if (currentIndex !== -1 && currentIndex < categories.length - 1) {
                const nextCategory = categories[currentIndex + 1];
                const nextField = document.getElementById('field-specific-' + nextCategory);
                if (nextField && nextField.classList.contains('hidden')) {
                    nextField.classList.remove('hidden');
                    setTimeout(() => {
                        nextField.classList.remove('opacity-0');
                    }, 50);
                    
                    // Auto-scroll slightly so the new section is visible
                    setTimeout(() => {
                        nextField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                }
            } else if (currentIndex === categories.length - 1) {
                // If it's the last one (tires), show "Other" field
                const otherField = document.getElementById('field-other');
                if (otherField && otherField.classList.contains('hidden')) {
                    otherField.classList.remove('hidden');
                    setTimeout(() => {
                        otherField.classList.remove('opacity-0');
                    }, 50);
                }
            }
            
            validateForm();
        }

        function validateForm() {
            let complete = true;
            categories.forEach(cat => {
                if (!componentChoices[cat]) {
                    complete = false;
                }
            });

            const btn = document.getElementById('build-submit-btn');
            const spinElements = ['spin-rear-tire', 'spin-front-tire', 'spin-rear-spokes', 'spin-front-spokes'];
"""

content = re.sub(r'        // Check for URL params to prefill service.*const spinElements = \[\'spin-rear-tire\', \'spin-front-tire\', \'spin-rear-spokes\', \'spin-front-spokes\'\];', js_replacement, content, flags=re.DOTALL)

# In submission logic
submit_replacement = """
                Frame: ${componentChoices.frame}
                Handlebar: ${componentChoices.handlebar}
                Stem: ${componentChoices.stem}
                Wheelset: ${componentChoices.wheelset}
                Groupset: ${componentChoices.groupset}
                Seatpost: ${componentChoices.seatpost}
                Saddle: ${componentChoices.saddle}
                Tires: ${componentChoices.tires}
                Notes/Other: ${document.getElementById('spec-other').value}
"""

content = re.sub(r'                Frame:.*?\n                Notes/Other: \$\{document\.getElementById\(\'spec-other\'\)\.value\}', submit_replacement.strip(), content, flags=re.DOTALL)


with open('intake.html', 'w') as f:
    f.write(content)

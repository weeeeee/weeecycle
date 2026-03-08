const { JSDOM } = require("jsdom");
const fs = require('fs');

const html = fs.readFileSync('workshop.html', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", url: "http://localhost/" });

const window = dom.window;
const document = window.document;

// Mock localStorage
let store = {
  'workshop_jobs': JSON.stringify([{id: "123", customer: "Zach", status: "booked"}])
};

window.localStorage = {
  getItem: key => store[key] || null,
  setItem: (key, value) => store[key] = value,
  removeItem: key => delete store[key]
};


window.onload = () => {
   console.log("Loaded!");
   
   try {
       // Mock confirm to always return true
       window.confirm = () => true;

       // Render board
       window.renderKanban();
       
       const jobsBefore = JSON.parse(window.localStorage.getItem('workshop_jobs'));
       console.log("Jobs before:", jobsBefore);
       
       // Trigger delete
       console.log("Deleting job 123...");
       window.deleteJob("123");
       
       const jobsAfter = JSON.parse(window.localStorage.getItem('workshop_jobs'));
       console.log("Jobs after:", jobsAfter);
       
   } catch(e) {
       console.error("Crash!", e);
   }
}

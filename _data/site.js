module.exports = {
  url: process.env.SITE_URL || "https://prayerhub.space",
  name: "Prayer Hub",
  description: "A daily-updated library of Catholic prayers: morning and night prayers, prayers to the saints, novenas, the Psalms and Bible verses by topic.",
  // WebSub hub announced in the feeds and pinged by the publisher on every publish.
  websubHub: "https://pubsubhubbub.appspot.com/",
  buildDate: new Date().toISOString(),
};

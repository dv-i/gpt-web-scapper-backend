const express = require("express");
const app = express();
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/scrape", async (req, res) => {
  console.log(req.body);
  const body = JSON.parse(req.body);
  const pageURL = body.pageURL;

  const today = new Date();
  const modifiedPageName = `${pageURL}-${today.toISOString()}`;

  const doTheThing = async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(PAGE_URL);

    const selectedElements = await page.$$("p");

    for (let el of selectedElements) {
      const oldText = await el.evaluate((_) => _.innerText);

      const textToReplace = await gptRephraseText(oldText);

      const newText = await el.evaluate((_, updatedText) => {
        _.innerText = updatedText;
        return _.innerHTML;
      }, textToReplace);

      console.log(`Old Text: ${oldText}`);
      console.log(`New Text: ${newText}\n\n`);

      await sleep(20000);
    }

    const cdp = await page.target().createCDPSession();
    const { data } = await cdp.send("Page.captureSnapshot", {
      format: "mhtml",
    });

    fs.writeFileSync(`${modifiedPageName}.html`, data);

    browser.close();
  };

  await doTheThing();

  res.send(`${modifiedPageName}.mhtml`);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

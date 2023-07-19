const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

async function gptRephraseText(textToRephrase) {
  return "Insert chatgpt rewritten text here...";
}

function extractDomain(url) {
  // Remove the protocol (http:// or https://) from the URL
  let domain = url.replace(/(^\w+:|^)\/\//, "");

  // Remove anything after the first forward slash (/)
  domain = domain.split("/")[0];

  // Remove port number if present
  domain = domain.split(":")[0];

  // Remove 'www' subdomain if present
  if (domain.startsWith("www.")) {
    domain = domain.slice(4);
  }

  return domain;
}

app.post("/scrape", async (req, res) => {
  const body = req.body;
  const pageURL = body.pageURL;

  const today = new Date();
  // const modifiedPageFileName = `${extractDomain(pageURL)}-${today.toISOString()}`;
  const modifiedPageFileName = `${extractDomain(pageURL)}.mhtml`;

  const doTheThing = async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    console.log("pageURL", pageURL);

    await page.goto(pageURL);

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
    }

    const cdp = await page.target().createCDPSession();
    const { data } = await cdp.send("Page.captureSnapshot", {
      format: "mhtml",
    });

    fs.writeFileSync(path.join(__dirname, modifiedPageFileName), data);

    browser.close();
  };

  await doTheThing();

  res.json(path.join(__dirname, modifiedPageFileName));
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

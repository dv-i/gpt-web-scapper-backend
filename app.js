import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import * as chatgpt from "chatgpt";

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

async function gptRephraseText(textToRephrase) {
  const api = new chatgpt.ChatGPTAPI({
    apiKey: "enter apiKey here",
    completionParams: {
      model: "gpt-3.5-turbo",
    },
  });

  try {
    if (textToRephrase.split(" ").length <= 4) {
      throw new Error(`Text too short - ${textToRephrase}, not rephrasing`);
    }
    const res = await api.sendMessage(
      `Paraphrase the following text for me and only return the paraphrased text: ${textToRephrase}`
    );
    return res.text;
  } catch (error) {
    console.error(error);
    return textToRephrase;
  }
  // return "Insert chatgpt rewritten text here...";
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
  const modifiedPageFileName = `${extractDomain(
    pageURL
  )}-${today.toISOString()}.mhtml`;

  const doTheThing = async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    console.log("pageURL", pageURL);

    await page.goto(pageURL, { waitUntil: "networkidle0" });

    const selectedElements = await page.$$("p, h1, h2, h3, h4, h5, h6, li, td");

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

    fs.writeFileSync(path.join(process.cwd(), modifiedPageFileName), data);

    browser.close();
  };

  await doTheThing();

  res.json(path.join(process.cwd(), modifiedPageFileName));
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

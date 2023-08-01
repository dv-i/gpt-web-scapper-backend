import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import * as chatgpt from "chatgpt";

const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
  })
);

app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

async function gptRephraseText(textToRephrase) {
  const api = new chatgpt.ChatGPTAPI({
    apiKey: process.env.OPENAI_API_KEY || "",
    completionParams: {
      model: "gpt-3.5-turbo",
    },
  });

  try {
    if (textToRephrase.split(" ").length < 4) {
      throw new Error(`Text too short - ${textToRephrase}, not rephrasing`);
    }

    const res = await api.sendMessage(
      `Please paraphrase the following text in a formal and professional style of writing, maintaining a neutral tone throughout the paraphrased version. Only return the paraphrased text: ${textToRephrase}`
    );
    return ` ${res.text} `;
  } catch (error) {
    console.error(error);
    return textToRephrase;
  }
  // return "Insert chatgpt text...";
}

const getFileFromDisk = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

async function processSelectedElements(selectedElements) {
  console.log("processSelectedElements()");
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rateLimitDelay = 250; // Adjust this value based on the model's RPS rate limit

  let cnt = 0;
  for (let el of selectedElements) {
    const oldText = await el.evaluate((_) => _.innerText);
    cnt++;
    if (cnt === 60) break;

    const oldHTML = await el.evaluate((_) => _.innerHTML);
    console.log("oldHtml", oldHTML);

    try {
      if (oldText.split(" ").length < 4) {
        throw new Error(`Text too short - ${oldText}, not rephrasing`);
      }

      console.log("RUNNING...");
      const textToReplace = await gptRephraseText(oldText);

      console.log("Text to replace - ", textToReplace);

      const iteratorResult = await el.evaluate((element, updatedText) => {
        const allTextNodes = document.createNodeIterator(
          element,
          NodeFilter.SHOW_TEXT
        );

        let node;
        let nodes = [];
        let nodeText = [];
        while ((node = allTextNodes.nextNode())) {
          if (node.parentElement === element) {
            nodes.push(`Replacing ${node.nodeValue} with ${updatedText}`);
            nodeText.push(node.parentElement.nodeName);
            node.nodeValue = updatedText; // Update the text of each text node
          }
        }

        return {
          nodes: nodes,
          nodeText: nodeText,
        };
      }, textToReplace);

      // const newText = await el.evaluate((_, updatedText) => {
      //   _.innerText = updatedText;
      //   return _.innerHTML;
      // }, textToReplace);

      console.log("Iterator result", iteratorResult);
      console.log("Old text - ", oldText);
      console.log("New Text - ", textToReplace);

      // Introduce a delay before making the next API call
      await delay(rateLimitDelay);
    } catch (error) {
      console.error(error);
    }
  }
}

async function loadLazyImagesAndWaitForCompletion(page) {
  // Scroll down to the bottom of the page to trigger lazy loading
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });

  // Wait for a short period to give time for images to load
  await page.waitForTimeout(5000);

  // Wait for all images to load using Puppeteer's built-in function
  await page.waitForFunction(() => {
    const lazyLoadImages = document.querySelectorAll("img[data-src]");
    const unloadedImages = Array.from(lazyLoadImages).filter(
      (img) => !img.complete
    );
    return unloadedImages.length === 0;
  });
}

app.post("/scrape", async (req, res) => {
  const body = req.body;
  const pageURL = body.pageURL;

  const modifiedPageFileName = body.modifiedPageFileName;

  const doTheThing = async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    console.log("pageURL", pageURL);

    await page.goto(pageURL, {
      waitUntil: "domcontentloaded",
    });

    await page.waitForNetworkIdle({
      idleTime: "1500",
    });

    // Wait for the page and all resources to be loaded
    // await page.waitForNavigation({
    //   waitUntil: "networkidle0",
    // });

    await page.evaluate(() => {
      const lazyLoadImages = document.querySelectorAll("img[data-src]");
      lazyLoadImages.forEach((img) => {
        img.src = img.dataset.src;
      });
    });

    await loadLazyImagesAndWaitForCompletion(page);

    const selectedElements = await page.$$(
      "p, h1, h2, h3, h4, h5, h6, li, td, em, strong, b, a"
    );

    await processSelectedElements(selectedElements);

    const cdp = await page.target().createCDPSession();
    const { data } = await cdp.send("Page.captureSnapshot", {
      format: "mhtml",
    });

    fs.writeFileSync(path.join(process.cwd(), modifiedPageFileName), data);

    browser.close();
  };

  await doTheThing();

  console.log("Finished. Sending back", modifiedPageFileName);

  // res.json(modifiedPageFileName);
});

app.post("/download", async (req, res) => {
  try {
    const fileName = req.body.fileName;
    console.log("fileName - ", fileName);
    const filePath = path.join(process.cwd(), fileName);
    console.log(filePath);
    const fileData = await getFileFromDisk(filePath);

    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.send(fileData);
  } catch (error) {
    console.error("Error while serving file:", error);
    res.status(500).send("Failed to download the file.");
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

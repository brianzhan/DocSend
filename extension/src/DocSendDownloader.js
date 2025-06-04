let connection;
let numSlides = parseInt((document.getElementsByClassName("page-label")[0].innerHTML).split(" ")[0]);
let baseUrl = window.location.href;
let metadataEndpoint = baseUrl.charAt(baseUrl.length-1) == "/" ? baseUrl + "page_data/" : baseUrl + "/page_data/";
let slideImageUrls = [];

let slideDeckAlreadyDownloaded = false;
let slideDeckGenerationInProgress = false;

let userIsAuthenticated = () => {
    return document.getElementById("prompt") == null;
};

let getSlideImageUrls = async () => {
    for(let i=1; i<=numSlides; i++) {
        let url = metadataEndpoint + String(i);
        await fetch(url)
        .then((response) => response.json())
        .then((data) => slideImageUrls.push(data.imageUrl));
    }
};

let generateSlideDeckPdf = async () => {
    await getSlideImageUrls();
    buildPdf(slideImageUrls);
};

chrome.runtime.onConnect.addListener((port) => {
    connection = port;
    port.onMessage.addListener((message) => {
        if (userIsAuthenticated()) {
            if (message.requestType == "GENERATE_PDF") {
                slideDeckGenerationInProgress = true;
                slideDeckAlreadyDownloaded = true;
                showCustomAlert(`Generating slide deck as PDF: 0/${numSlides} slides complete...`);
                generateSlideDeckPdf();
            } else if (message.requestType == "CHECK_PROGRESS") {
                if (slideDeckGenerationInProgress) {
                    showCustomAlert("Please wait. Still generating slide deck as PDF...");
                } else if (slideDeckAlreadyDownloaded) {
                    showDefaultAlert("Slide deck was already downloaded during this session. Please reload the page to download again.");
                } else {
                    showDefaultAlert("ERROR: Slide deck download progress unknown. Please try again.");
                }
            }
        } else {
            showDefaultAlert("You must be signed in to download this slide deck as a PDF.");
        }
    });
});


let startTime;
let numSlidesComplete = 0;
const doc = new PDFDocument({layout:'landscape', margin: 0, autoFirstPage: false});
const stream = doc.pipe(blobStream());

stream.on("finish", () => {
    slideDeckGenerationInProgress = false;
    let blobUrl = stream.toBlobURL('application/pdf');
    let totalTime = new Date().getTime() - startTime;
    initiateDownload(blobUrl);
    hideCustomAlert();
    showDefaultAlert("Done ! Slide deck PDF generated in " + String(totalTime) + " ms.");
    connection.postMessage({requestType: "SET_JOB_COMPLETE"});
});

const getImageAsBlob = async (url) =>
    await fetch(url)
    .then((response) => {
        numSlidesComplete++;
        showCustomAlert(`Generating slide deck as PDF: ${numSlidesComplete}/${numSlides} slides complete...`);
        return response.blob();
    })
    .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    }))
    .catch(() => {
        console.error("Error fetching slide deck images.");
    });

const addSlidesToPDF = async (imageUrls) =>{
    for (let i=0; i<imageUrls.length; i++) {
        await getImageAsBlob(imageUrls[i]).then(data => {
            const img = doc.openImage(data);
            doc.addPage({size: [img.width, img.height]});
            doc.image(img, 0, 0);
        });    
    }
};

const buildPdf = async (imageUrls) => {
    startTime = new Date().getTime();
    await addSlidesToPDF(imageUrls);
    doc.end();
};


let defaultAlertContainer = document.getElementsByClassName("row flash flash-notice")[0];
let defaultAlertTextElement = document.getElementsByClassName("alert_content alert_content--with-close")[0];

let customAlertContainer = document.createElement("div");
let customAlertContainerText = document.createElement("div");

customAlertContainer.className = "row alert alert-info";
customAlertContainer.style = "display: none;";
customAlertContainerText.className = "alert_content";
customAlertContainerText.style = "display: flex;flex-direction: row;justify-content: center;align-items: center;";

customAlertContainer.appendChild(customAlertContainerText);
document.body.insertBefore(customAlertContainer, document.body.firstChild);

let initiateDownload = (url) => {
    const filename = document.getElementsByClassName("contact-card_description").length === 1 ? document.getElementsByClassName("contact-card_description")[0].innerText.substring(1, document.getElementsByClassName("contact-card_description")[0].innerText.length-1) + " Deck" : document.getElementsByClassName("contact-card_email").length === 1 ? document.getElementsByClassName("contact-card_email")[0].href.split("@")[1].split(".")[0] + " Deck" : "slidedeck";
    let downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.setAttribute('download', `${filename}.pdf`);
    downloadLink.click();
};

let showDefaultAlert = (message) => {
    if (!defaultAlertContainer || !defaultAlertTextElement) return;
    defaultAlertTextElement.innerHTML = message;
    defaultAlertContainer.setAttribute("style", "display:block;");
};

let showCustomAlert = (message) => {
    customAlertContainerText.innerHTML = message;
    customAlertContainer.style = "display: block; padding: 10px; margin-bottom: 0px;";
};

let hideDefaultAlert = () => {
    if (!defaultAlertContainer || !defaultAlertTextElement) return;
    defaultAlertTextElement.innerHTML = "";
    defaultAlertContainer.setAttribute("style", "display:none;");
};

let hideCustomAlert = () => {
    customAlertContainer.style = "display: none;";
};

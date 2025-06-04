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

const buildPdf = async (imageUrls) => {
    startTime = new Date().getTime();
    const blobs = [];
    for (let i=0; i<imageUrls.length; i++) {
        await getImageAsBlob(imageUrls[i]).then(data => blobs.push(data));
    }
    const pdfBlob = createPdfFromImages(blobs);
    slideDeckGenerationInProgress = false;
    initiateDownload(URL.createObjectURL(pdfBlob));
    hideCustomAlert();
    let totalTime = new Date().getTime() - startTime;
    showDefaultAlert("Done ! Slide deck PDF generated in " + String(totalTime) + " ms.");
    connection.postMessage({requestType: "SET_JOB_COMPLETE"});
};

const getImageAsBlob = async (url) =>
    await fetch(url)
    .then((response) => {
        numSlidesComplete++;
        showCustomAlert(`Generating slide deck as PDF: ${numSlidesComplete}/${numSlides} slides complete...`);
        return response.blob();
    })
    .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({data: reader.result, blob});
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    }))
    .catch((e) => {
        console.error("Error fetching slide deck images.");
    });

function createPdfFromImages(images) {
    let pdf = '%PDF-1.3\n';
    const objects = [];
    const offsets = [0];

    function addObject(str) {
        offsets.push(pdf.length);
        pdf += str;
    }

    const pageKids = [];
    let objIndex = 1;
    for (let i=0; i<images.length; i++) {
        const image = images[i];
        const img = new Image();
        img.src = image.data;
        const width = img.width || 800;
        const height = img.height || 600;
        const imageObjId = ++objIndex;
        const contentObjId = ++objIndex;
        const pageObjId = ++objIndex;

        const imgBinary = atob(image.data.split(',')[1]);
        const imgLength = imgBinary.length;
        addObject(`${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgLength} >>\nstream\n`);
        pdf += imgBinary + '\nendstream\nendobj\n';

        addObject(`${contentObjId} 0 obj\n<< /Length ${('q '+width+' 0 0 '+height+' 0 0 cm /Im'+i+' Do Q').length} >>\nstream\nq ${width} 0 0 ${height} 0 0 cm /Im${i} Do Q\nendstream\nendobj\n`);

        addObject(`${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im${i} ${imageObjId} 0 R >> >> /MediaBox [0 0 ${width} ${height}] /Contents ${contentObjId} 0 R >>\nendobj\n`);

        pageKids.push(`${pageObjId} 0 R`);
    }

    const pagesObj = `2 0 obj\n<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${images.length} >>\nendobj\n`;
    addObject(pagesObj);

    const catalogObj = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    addObject(catalogObj);

    const xrefStart = pdf.length;
    pdf += 'xref\n0 ' + (offsets.length) + '\n0000000000 65535 f \n';
    for (let i=1; i<offsets.length; i++) {
        pdf += ("0000000000" + offsets[i]).slice(-10) + ' 00000 n \n';
    }

    pdf += 'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';

    return new Blob([pdf], {type: 'application/pdf'});
}

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

let hideCustomAlert = () => {
    customAlertContainer.style = "display: none;";
};

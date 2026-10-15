/* =========================================================
   ELEMENTS
========================================================= */

const fileInput =
    document.getElementById("fileInput");

const uploadSection =
    document.getElementById("uploadSection");

const documentSection =
    document.getElementById("documentSection");

const settingsSection =
    document.getElementById("settingsSection");

const processingSection =
    document.getElementById("processingSection");

const resultSection =
    document.getElementById("resultSection");

const fileName =
    document.getElementById("fileName");

const fileType =
    document.getElementById("fileType");

const wordCount =
    document.getElementById("wordCount");

const charCount =
    document.getElementById("charCount");

const translateBtn =
    document.getElementById("translateBtn");

const changeFileBtn =
    document.getElementById("changeFileBtn");

const removeFileBtn =
    document.getElementById("removeFileBtn");

const newDocumentBtn =
    document.getElementById("newDocumentBtn");

const translationPreview =
    document.getElementById("translationPreview");

const copyBtn =
    document.getElementById("copyBtn");

const pdfDownload =
    document.getElementById("pdfDownload");

const docxDownload =
    document.getElementById("docxDownload");

const errorMessage =
    document.getElementById("errorMessage");

const progressBar =
    document.getElementById("progressBar");

const progressPercent =
    document.getElementById("progressPercent");

const processingTitle =
    document.getElementById("processingTitle");

const processingText =
    document.getElementById("processingText");

const themeBtn =
    document.getElementById("themeBtn");

const dropZone =
    document.getElementById("dropZone");


/* =========================================================
   GLOBAL DATA
========================================================= */

let uploadedDocument = null;
let translatedSections = [];


/* =========================================================
   HELPER - SHOW ERROR
========================================================= */

function showError(message) {

    errorMessage.textContent = message;

    errorMessage.classList.add("show");

}


/* =========================================================
   HELPER - CLEAR ERROR
========================================================= */

function clearError() {

    errorMessage.textContent = "";

    errorMessage.classList.remove("show");

}


/* =========================================================
   FILE SELECT
========================================================= */

fileInput.addEventListener(
    "change",
    function () {

        const file =
            fileInput.files[0];

        if (file) {

            handleFile(file);

        }

    }
);


/* =========================================================
   HANDLE FILE
========================================================= */

async function handleFile(file) {

    clearError();

    const extension =
        file.name
            .split(".")
            .pop()
            .toLowerCase();


    if (
        extension !== "pdf" &&
        extension !== "txt"
    ) {

        showError(
            "Please upload a PDF or TXT document."
        );

        return;

    }


    /* -----------------------------------------
       File size check
    ----------------------------------------- */

    const maxSize =
        25 * 1024 * 1024;

    if (file.size > maxSize) {

        showError(
            "File is too large. Maximum file size is 25 MB."
        );

        return;

    }


    /* -----------------------------------------
       Show temporary upload state
    ----------------------------------------- */

    uploadSection.classList.add("hidden");

    documentSection.classList.remove("hidden");

    settingsSection.classList.add("hidden");

    resultSection.classList.add("hidden");


    fileName.textContent =
        file.name;

    fileType.textContent =
        extension.toUpperCase();

    wordCount.textContent =
        "Analyzing...";

    charCount.textContent =
        formatFileSize(file.size);


    /* -----------------------------------------
       Send document to backend
    ----------------------------------------- */

    const formData =
        new FormData();

    formData.append(
        "file",
        file
    );


    try {

        const response =
            await fetch(
                "/upload",
                {
                    method: "POST",
                    body: formData
                }
            );


        const data =
            await response.json();


        if (!data.success) {

            uploadSection.classList.remove(
                "hidden"
            );

            documentSection.classList.add(
                "hidden"
            );

            showError(
                data.message
            );

            return;

        }


        /* -----------------------------------------
           Store document information
        ----------------------------------------- */

        uploadedDocument = data;


        wordCount.textContent =
            `${data.word_count.toLocaleString()} words`;

        charCount.textContent =
            `${data.character_count.toLocaleString()} characters`;


        /* -----------------------------------------
           Show translation settings
        ----------------------------------------- */

        settingsSection.classList.remove(
            "hidden"
        );


    } catch (error) {

        console.error(error);

        uploadSection.classList.remove(
            "hidden"
        );

        documentSection.classList.add(
            "hidden"
        );

        showError(
            "Unable to connect to the Flask server."
        );

    }

}


/* =========================================================
   DRAG & DROP
========================================================= */

uploadSection.addEventListener(
    "dragover",
    function (event) {

        event.preventDefault();

        uploadSection.classList.add(
            "dragging"
        );

    }
);


uploadSection.addEventListener(
    "dragleave",
    function () {

        uploadSection.classList.remove(
            "dragging"
        );

    }
);


uploadSection.addEventListener(
    "drop",
    function (event) {

        event.preventDefault();

        uploadSection.classList.remove(
            "dragging"
        );


        const file =
            event.dataTransfer.files[0];

        if (file) {

            handleFile(file);

        }

    }
);


/* =========================================================
   CHANGE FILE
========================================================= */

changeFileBtn.addEventListener(
    "click",
    function () {

        fileInput.click();

    }
);


/* =========================================================
   REMOVE FILE
========================================================= */

removeFileBtn.addEventListener(
    "click",
    function () {

        resetApplication();

    }
);


/* =========================================================
   TRANSLATE DOCUMENT
========================================================= */

translateBtn.addEventListener(
    "click",
    async function () {

        if (!uploadedDocument) {

            showError(
                "Please upload a document first."
            );

            return;

        }


        clearError();

        settingsSection.classList.add(
            "hidden"
        );

        documentSection.classList.add(
            "hidden"
        );

        resultSection.classList.add(
            "hidden"
        );

        processingSection.classList.remove(
            "hidden"
        );


        startProcessingAnimation();


        try {

            const response =
                await fetch(
                    "/translate-document",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            sections:
                                uploadedDocument.sections,

                            filename:
                                uploadedDocument.filename
                        })
                    }
                );


            const data =
                await response.json();


            if (!data.success) {

                processingSection.classList.add(
                    "hidden"
                );

                documentSection.classList.remove(
                    "hidden"
                );

                settingsSection.classList.remove(
                    "hidden"
                );

                showError(
                    data.message
                );

                return;

            }


            /* -------------------------------------
               Save translated sections
            ------------------------------------- */

            translatedSections =
                data.sections;


            /* -------------------------------------
               Show result
            ------------------------------------- */

            displayTranslation(
                data.sections
            );


            pdfDownload.href =
                data.pdf_url;

            docxDownload.href =
                data.docx_url;


            finishProcessing();


        } catch (error) {

            console.error(error);

            processingSection.classList.add(
                "hidden"
            );

            documentSection.classList.remove(
                "hidden"
            );

            settingsSection.classList.remove(
                "hidden"
            );

            showError(
                "Translation server error. Please try again."
            );

        }

    }
);


/* =========================================================
   PROCESSING ANIMATION
========================================================= */

function startProcessingAnimation() {

    progressBar.style.width =
        "8%";

    progressPercent.textContent =
        "8%";


    document.getElementById(
        "step1"
    ).classList.add(
        "active"
    );


    processingTitle.textContent =
        "Analyzing your document...";

    processingText.textContent =
        "Understanding the academic structure of your notes.";


    setTimeout(
        function () {

            if (
                processingSection.classList.contains(
                    "hidden"
                )
            ) {
                return;
            }


            progressBar.style.width =
                "25%";

            progressPercent.textContent =
                "25%";


            document.getElementById(
                "step1"
            ).classList.add(
                "complete"
            );

            document.getElementById(
                "step2"
            ).classList.add(
                "active"
            );


            processingTitle.textContent =
                "Translating academic content...";

            processingText.textContent =
                "Our neural machine translation model is processing the document.";

        },
        700
    );


    setTimeout(
        function () {

            if (
                processingSection.classList.contains(
                    "hidden"
                )
            ) {
                return;
            }


            progressBar.style.width =
                "55%";

            progressPercent.textContent =
                "55%";


            document.getElementById(
                "step2"
            ).classList.add(
                "complete"
            );

            document.getElementById(
                "step3"
            ).classList.add(
                "active"
            );


            processingTitle.textContent =
                "Reconstructing document structure...";

            processingText.textContent =
                "Preserving headings, paragraphs and lists.";

        },
        1600
    );


    setTimeout(
        function () {

            if (
                processingSection.classList.contains(
                    "hidden"
                )
            ) {
                return;
            }


            progressBar.style.width =
                "78%";

            progressPercent.textContent =
                "78%";


            document.getElementById(
                "step3"
            ).classList.add(
                "complete"
            );

            document.getElementById(
                "step4"
            ).classList.add(
                "active"
            );


            processingTitle.textContent =
                "Creating your translated document...";

            processingText.textContent =
                "Generating the final Hindi PDF and DOCX files.";

        },
        2600
    );

}


/* =========================================================
   FINISH PROCESSING
========================================================= */

function finishProcessing() {

    progressBar.style.width =
        "100%";

    progressPercent.textContent =
        "100%";


    document.querySelectorAll(
        ".process-step"
    ).forEach(
        step => step.classList.add(
            "complete"
        )
    );


    processingTitle.textContent =
        "Translation complete!";

    processingText.textContent =
        "Your academic document has been translated successfully.";


    setTimeout(
        function () {

            processingSection.classList.add(
                "hidden"
            );

            resultSection.classList.remove(
                "hidden"
            );

            resultSection.scrollIntoView({
                behavior: "smooth"
            });

        },
        700
    );

}


/* =========================================================
   DISPLAY TRANSLATION
========================================================= */

function displayTranslation(
    sections
) {

    translationPreview.innerHTML =
        "";


    sections.forEach(
        function (section) {

            const element =
                document.createElement(
                    "div"
                );


            element.classList.add(
                "translated-element"
            );


            if (
                section.type ===
                "title"
            ) {

                element.classList.add(
                    "translated-title"
                );

                element.textContent =
                    section.text;

            }


            else if (
                section.type ===
                "subtitle"
            ) {

                element.classList.add(
                    "translated-subtitle"
                );

                element.textContent =
                    section.text;

            }


            else if (
                section.type ===
                "heading"
            ) {

                element.classList.add(
                    "translated-heading"
                );

                element.classList.add(
                    "translated-heading-" +
                    (section.level || 2)
                );

                element.textContent =
                    section.text;

            }


            else if (
                section.type ===
                "bullet"
            ) {

                element.classList.add(
                    "translated-bullet"
                );

                element.innerHTML =
                    `<span>•</span>
                     <p>${escapeHtml(section.text)}</p>`;

            }


            else if (
                section.type ===
                "number"
            ) {

                element.classList.add(
                    "translated-number"
                );

                element.innerHTML =
                    `<span>${escapeHtml(section.number || "")}</span>
                     <p>${escapeHtml(section.text)}</p>`;

            }


            else {

                element.classList.add(
                    "translated-paragraph"
                );

                element.textContent =
                    section.text;

            }


            translationPreview.appendChild(
                element
            );

        }
    );

}


/* =========================================================
   COPY TRANSLATION
========================================================= */

copyBtn.addEventListener(
    "click",
    async function () {

        if (
            !translatedSections.length
        ) {

            return;

        }


        const text =
            translatedSections
                .map(
                    section =>
                        section.text
                )
                .join("\n\n");


        try {

            await navigator.clipboard.writeText(
                text
            );


            copyBtn.textContent =
                "✓ Copied";


            setTimeout(
                function () {

                    copyBtn.textContent =
                        "⧉ Copy Text";

                },
                1800
            );


        } catch (error) {

            showError(
                "Unable to copy the translation."
            );

        }

    }
);


/* =========================================================
   NEW DOCUMENT
========================================================= */

newDocumentBtn.addEventListener(
    "click",
    function () {

        resetApplication();

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    }
);


/* =========================================================
   RESET
========================================================= */

function resetApplication() {

    uploadedDocument =
        null;

    translatedSections =
        [];


    fileInput.value =
        "";


    uploadSection.classList.remove(
        "hidden"
    );

    documentSection.classList.add(
        "hidden"
    );

    settingsSection.classList.add(
        "hidden"
    );

    processingSection.classList.add(
        "hidden"
    );

    resultSection.classList.add(
        "hidden"
    );


    translationPreview.innerHTML =
        "";


    clearError();


    document.querySelectorAll(
        ".process-step"
    ).forEach(
        step => {

            step.classList.remove(
                "active",
                "complete"
            );

        }
    );


    progressBar.style.width =
        "0%";

    progressPercent.textContent =
        "0%";

}


/* =========================================================
   DARK MODE
========================================================= */

themeBtn.addEventListener(
    "click",
    function () {

        document.body.classList.toggle(
            "dark"
        );


        if (
            document.body.classList.contains(
                "dark"
            )
        ) {

            themeBtn.textContent =
                "☀";

        } else {

            themeBtn.textContent =
                "☾";

        }

    }
);


/* =========================================================
   FILE SIZE
========================================================= */

function formatFileSize(
    bytes
) {

    if (
        bytes === 0
    ) {

        return "0 Bytes";

    }


    const units =
        [
            "Bytes",
            "KB",
            "MB",
            "GB"
        ];


    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    return (
        parseFloat(
            (
                bytes /
                Math.pow(
                    1024,
                    index
                )
            ).toFixed(2)
        )
        + " "
        + units[index]
    );

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(
    text
) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        text;

    return div.innerHTML;

}
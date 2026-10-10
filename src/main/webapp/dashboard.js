// ========== ELEMENTS ==========
const dashboardToast = document.getElementById("dashboardToast");
const sidebar = document.querySelector(".sidebar");
const topPageLabel = document.getElementById("topPageLabel");
const navItems = document.querySelectorAll(".nav-item[data-page]");
const notificationPanel = document.getElementById("notificationPanel");
const announcementModal = document.getElementById("announcementModal");


// ========== TOAST ==========
let toastTimer;

function showToast(message) {
    clearTimeout(toastTimer);
    dashboardToast.textContent = message;
    dashboardToast.classList.add("show");
    toastTimer = setTimeout(function () {
        dashboardToast.classList.remove("show");
    }, 2500);
}

// welcome message saved by the sign-in page, shown once
const saved = sessionStorage.getItem("toastMessage");
if (saved) {
    showToast(saved);
    sessionStorage.removeItem("toastMessage");
}


// ========== NAVIGATION ==========
const pageLabels = {
    dashboard: "Dashboard",
    bulletin: "Bulletin Board",
    ask: "Ask for Help",
    feedback: "Feedback Board",
    virtual: "Virtual Help",
    materials: "Learning Materials",
    requests: "My Requests",
    profile: "My Profile"
};

function showSection(pageName) {
    document.querySelectorAll(".content-section").forEach(function (s) {
        s.classList.remove("active-section");
    });

    const selected = document.getElementById(pageName + "Section");
    if (selected) selected.classList.add("active-section");

    navItems.forEach(function (item) {
        item.classList.toggle("active", item.dataset.page === pageName);
    });

    topPageLabel.textContent = pageLabels[pageName] || "Dashboard";
    sidebar.classList.remove("mobile-open");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// every element with data-page (sidebar, quick actions, "View All", "+ New Request")
document.querySelectorAll("[data-page]").forEach(function (button) {
    button.addEventListener("click", function () {
        showSection(button.dataset.page);
    });
});

// "+ New Request" also puts the cursor in the topic box
document.querySelectorAll(".new-request-button").forEach(function (button) {
    button.addEventListener("click", function () {
        setTimeout(function () {
            document.getElementById("helpTopic").focus();
        }, 300);
    });
});

document.getElementById("mobileMenuButton").addEventListener("click", function () {
    sidebar.classList.toggle("mobile-open");
});


// ========== NOTIFICATIONS ==========
const notificationButton = document.getElementById("notificationButton");

notificationButton.addEventListener("click", function (event) {
    event.stopPropagation();
    notificationPanel.classList.toggle("active");
});

document.getElementById("closeNotifications").addEventListener("click", function () {
    notificationPanel.classList.remove("active");
});

// click anywhere outside closes the panel
document.addEventListener("click", function (event) {
    if (!notificationPanel.contains(event.target) && !notificationButton.contains(event.target)) {
        notificationPanel.classList.remove("active");
    }
});


// ========== POP-UP (announcements and learning materials) ==========
function openModal(label, title, text, date) {
    announcementModal.querySelector(".panel-label").textContent = label;
    document.getElementById("modalAnnouncementTitle").textContent = title;
    document.getElementById("modalAnnouncementText").textContent = text;
    document.getElementById("modalAnnouncementDate").textContent = date;
    announcementModal.classList.add("active");
}

function closeModal() {
    announcementModal.classList.remove("active");
}

document.getElementById("closeAnnouncement").addEventListener("click", closeModal);

announcementModal.addEventListener("click", function (event) {
    if (event.target === announcementModal) closeModal();
});


// ========== NEWS FROM THE DATABASE (posted by organization members only) ==========
function dayOf(text) {              // "2026-10-15" -> local Date (no time-zone shift)
    const p = text.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function emptyNote(text) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = text;
    return note;
}

function loadAnnouncements() {
    const bulletinGrid = document.querySelector(".bulletin-grid");
    const homeList = document.querySelector("#dashboardSection .announcement-list");
    const bulletinColors = ["announcement-purple", "announcement-green", "announcement-pink", "announcement-yellow"];
    const homeColors = ["pink-item", "purple-item", "green-item"];

    fetch("announcements")
        .then(function (response) {
            if (!response.ok) throw new Error("announcements returned " + response.status);
            return response.json();
        })
        .then(function (items) {
            bulletinGrid.innerHTML = "";
            homeList.innerHTML = "";

            if (items.length === 0) {
                bulletinGrid.appendChild(emptyNote("No updates or news yet."));
                homeList.appendChild(emptyNote("No updates or news yet."));
                return;
            }

            items.forEach(function (a, i) {
                const posted = new Date(a.createdAt.replace(" ", "T"));
                const eventDay = a.eventDate ? dayOf(a.eventDate) : posted;

                const eventLong = eventDay.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
                const postedLong = posted.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                    + " at " + posted.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                const shortMonth = eventDay.toLocaleString("en-US", { month: "short" }).toUpperCase();

                function open() {
                    openModal(
                        "ANNOUNCEMENT",
                        a.title,
                        a.body,
                        "Event date: " + eventLong + " · Posted " + postedLong + " · " + a.category + " · by " + a.author
                    );
                }

                // Bulletin Board card
                const card = document.createElement("article");
                card.className = "large-announcement " + bulletinColors[i % bulletinColors.length];
                card.innerHTML =
                    '<span class="announcement-tag"></span><h2></h2><p></p>' +
                    '<div class="announcement-footer"><span></span>' +
                    '<button class="read-button" type="button">Read More</button></div>';
                card.querySelector(".announcement-tag").textContent = a.category;
                card.querySelector("h2").textContent = a.title;
                card.querySelector("p").textContent =
                    a.body.length > 160 ? a.body.substring(0, 160) + "..." : a.body;
                card.querySelector(".announcement-footer span").textContent = eventLong;
                card.querySelector(".read-button").addEventListener("click", open);
                bulletinGrid.appendChild(card);

                // Dashboard "Latest News" (newest three)
                if (i < 3) {
                    const row = document.createElement("button");
                    row.type = "button";
                    row.className = "announcement-item " + homeColors[i % homeColors.length];
                    row.innerHTML =
                        '<div class="announcement-date"><strong></strong><span></span></div>' +
                        '<div><strong></strong><p></p></div><span class="arrow">→</span>';
                    row.querySelector(".announcement-date strong").textContent = eventDay.getDate();
                    row.querySelector(".announcement-date span").textContent = shortMonth;
                    row.querySelector("div:nth-child(2) strong").textContent = a.title;
                    row.querySelector("div:nth-child(2) p").textContent = a.category;
                    row.addEventListener("click", open);
                    homeList.appendChild(row);
                }
            });
        })
        .catch(function (error) {
            console.error("Could not load announcements:", error);
            bulletinGrid.innerHTML = "";
            homeList.innerHTML = "";
            bulletinGrid.appendChild(emptyNote("Could not load updates."));
            homeList.appendChild(emptyNote("Could not load updates."));
        });
}

loadAnnouncements();

document.getElementById("announcementSearch").addEventListener("input", function () {
    const search = this.value.toLowerCase().trim();
    let visible = 0;

    document.querySelectorAll(".large-announcement").forEach(function (card) {
        const match = card.textContent.toLowerCase().includes(search);
        card.style.display = match ? "" : "none";
        if (match) visible++;
    });

    if (search && visible === 0) showToast("No announcements found.");
});


// ========== HELPERS ==========
// "2026-10-10 14:03:22.0" -> "5 min ago"
function timeAgo(text) {
    const d = new Date(text.replace(" ", "T"));
    const seconds = (Date.now() - d.getTime()) / 1000;
    if (isNaN(seconds) || seconds < 60) return "Just now";
    if (seconds < 3600) return Math.floor(seconds / 60) + " min ago";
    if (seconds < 86400) {
        const h = Math.floor(seconds / 3600);
        return h + (h === 1 ? " hour ago" : " hours ago");
    }
    if (seconds < 7 * 86400) {
        const days = Math.floor(seconds / 86400);
        return days + (days === 1 ? " day ago" : " days ago");
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fileExt(name) {
    const dot = name.lastIndexOf(".");
    return dot < 0 ? "FILE" : name.substring(dot + 1).toUpperCase();
}


// ========== ASK FOR HELP (saved to the database and matched to uploaded files) ==========
const helpResults = document.getElementById("helpResults");
const helpTopic = document.getElementById("helpTopic");
const helpDescription = document.getElementById("helpDescription");
helpTopic.maxLength = 150;
helpDescription.maxLength = 2000;

// one downloadable file, used in the results and in My Requests
function buildFileMatch(m) {
    const row = document.createElement("div");
    row.className = "file-match";
    row.innerHTML =
        '<div class="file-match-icon"></div>' +
        '<div class="file-match-info"><strong></strong><span></span></div>' +
        '<button type="button" class="download-button">Download</button>';
    row.querySelector(".file-match-icon").textContent = fileExt(m.fileName);
    row.querySelector("strong").textContent = m.title;
    row.querySelector("span").textContent = m.subject + " · " + m.fileName;
    row.querySelector(".download-button").addEventListener("click", function () {
        window.location.href = "presentation-file?id=" + m.id;
    });
    return row;
}

// jumps to the Feedback Board with the question already filled in
function askOnFeedbackBoard(text) {
    document.getElementById("feedbackBody").value = text.substring(0, 1000);
    showSection("feedback");
    setTimeout(function () { document.getElementById("feedbackBody").focus(); }, 300);
}

function renderHelpResults(request, description) {
    helpResults.innerHTML = "";
    helpResults.hidden = false;

    const feedbackText = request.topic + ": " + description;
    const toBoard = document.createElement("button");
    toBoard.type = "button";
    toBoard.className = "link-button";
    toBoard.addEventListener("click", function () { askOnFeedbackBoard(feedbackText); });

    if (request.matches.length === 0) {
        const box = document.createElement("div");
        box.className = "no-match";
        box.innerHTML = "<strong></strong><p></p>";
        box.querySelector("strong").textContent = 'Nothing found for "' + request.topic + '"';
        box.querySelector("p").textContent =
            "No uploaded file matches your request yet. Your request is saved, and if " +
            "someone uploads a matching file it will show up under My Requests. " +
            "You can also ask the community for feedback.";
        toBoard.textContent = "Ask on the Feedback Board";
        box.appendChild(toBoard);
        helpResults.appendChild(box);
    } else {
        const count = request.matches.length;
        const title = document.createElement("h3");
        title.textContent = "We found " + count + (count === 1 ? " file" : " files") + ' for "' + request.topic + '"';
        const note = document.createElement("p");
        note.textContent = "Best match first. These were shared by students and organization members.";
        helpResults.appendChild(title);
        helpResults.appendChild(note);
        request.matches.forEach(function (m) { helpResults.appendChild(buildFileMatch(m)); });

        toBoard.textContent = "Still stuck? Ask on the Feedback Board";
        toBoard.style.marginTop = "6px";
        helpResults.appendChild(toBoard);
    }

    helpResults.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.getElementById("helpRequestForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const form = this;
    const subject = document.getElementById("helpSubject").value;
    const topic = helpTopic.value.trim();
    const description = helpDescription.value.trim();

    if (!subject || !topic || !description) {
        showToast("Please complete all fields.");
        return;
    }

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Searching...";

    try {
        const response = await fetch("help-requests", {
            method: "POST",
            body: new URLSearchParams({ subject: subject, topic: topic, description: description })
        });

        if (response.status === 401) { window.location.replace("obligeU.html"); return; }
        if (response.status === 403) { showToast("Only students can send help requests."); return; }
        if (response.status === 400) { showToast("Please check your details and try again."); return; }
        if (!response.ok) throw new Error();

        const request = await response.json();
        form.reset();
        renderHelpResults(request, description);
        showToast(request.matches.length > 0 ? "We found files for you!" : "Nothing found for that topic.");
        loadRequests();
    } catch (error) {
        showToast("Could not send your request. Please try again.");
    } finally {
        button.disabled = false;
        button.textContent = "Submit Help Request";
    }
});


// ========== MY REQUESTS (from the database; files are re-matched every time) ==========
const iconColors = ["purple-bg", "green-bg", "pink-bg"];

function statusChip(request) {
    const chip = document.createElement("span");
    const matched = request.matches.length > 0;
    chip.className = "status " + (matched ? "resolved" : "pending");
    chip.textContent = matched ? "Matched" : "No match";
    return chip;
}

function buildRequestItem(request, i) {
    const item = document.createElement("div");
    item.className = "full-request stacked";
    item.innerHTML =
        '<div class="request-line">' +
        '<div class="request-topic-icon"></div>' +
        '<div class="request-info"><h3></h3><span></span></div></div>';

    const icon = item.querySelector(".request-topic-icon");
    icon.classList.add(iconColors[i % iconColors.length]);
    icon.textContent = request.topic.substring(0, 2).toUpperCase();
    item.querySelector("h3").textContent = request.topic;
    item.querySelector(".request-info span").textContent = request.subject + " · " + timeAgo(request.createdAt);
    item.querySelector(".request-line").appendChild(statusChip(request));

    if (request.matches.length > 0) {
        const files = document.createElement("div");
        files.className = "request-files";
        request.matches.forEach(function (m) { files.appendChild(buildFileMatch(m)); });
        item.appendChild(files);
    }
    return item;
}

function loadRequests() {
    const fullList = document.querySelector(".full-request-list");
    const table = document.querySelector("#dashboardSection .request-table");

    fetch("help-requests")
        .then(function (response) {
            if (response.status === 401) { window.location.replace("obligeU.html"); return null; }
            if (!response.ok) throw new Error();
            return response.json();
        })
        .then(function (requests) {
            if (!requests) return;

            // My Requests page
            fullList.innerHTML = "";
            if (requests.length === 0) {
                fullList.appendChild(emptyNote("You haven't asked for help yet."));
            }
            requests.forEach(function (r, i) { fullList.appendChild(buildRequestItem(r, i)); });

            // Dashboard "Recent Requests" table (keep the header row)
            table.querySelectorAll(".request-row:not(.table-header), .empty-note").forEach(function (el) { el.remove(); });
            if (requests.length === 0) {
                table.appendChild(emptyNote("No requests yet."));
            }
            requests.slice(0, 3).forEach(function (r) {
                const row = document.createElement("div");
                row.className = "request-row";
                row.innerHTML = "<span></span><span></span><span></span>";
                row.children[0].textContent = r.topic;
                row.children[1].textContent = r.subject;
                row.children[2].textContent = timeAgo(r.createdAt);
                row.appendChild(statusChip(r));
                table.appendChild(row);
            });

            // profile numbers
            document.getElementById("statRequests").textContent = requests.length;
            document.getElementById("statResolved").textContent =
                requests.filter(function (r) { return r.matches.length > 0; }).length;
        })
        .catch(function () {
            fullList.innerHTML = "";
            fullList.appendChild(emptyNote("Could not load your requests."));
        });
}

loadRequests();


// ========== FEEDBACK BOARD (saved to the database; students post, everyone answers) ==========
const feedbackList = document.getElementById("feedbackList");
const MAX_FEEDBACK_FILE = 10 * 1024 * 1024;   // same limit as the server (10 MB)

// a picture or file attached to a post or comment (the server sends it from /feedback-file)
function buildAttachment(type, id, fileName) {
    const url = "feedback-file?type=" + type + "&id=" + id;
    const box = document.createElement("div");
    box.className = "attachment";

    // pictures are shown in the page; click one to open it full size
    if (/\.(png|jpe?g|gif|webp)$/i.test(fileName)) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        const img = document.createElement("img");
        img.src = url;
        img.alt = fileName;
        img.loading = "lazy";
        link.appendChild(img);
        box.appendChild(link);
        return box;
    }

    // anything else: a small card with a Download button (reuses the .file-match look)
    box.classList.add("file-match");
    box.innerHTML =
        '<div class="file-match-icon"></div>' +
        '<div class="file-match-info"><strong></strong></div>' +
        '<a class="download-button">Download</a>';
    box.querySelector(".file-match-icon").textContent = fileName.split(".").pop().substring(0, 4);
    box.querySelector("strong").textContent = fileName;
    box.querySelector("a").href = url;
    return box;
}

function buildComment(c, reload) {
    const comment = document.createElement("div");
    comment.className = "comment";
    const isMember = c.role === "organization";
    comment.innerHTML =
        '<div class="thread-avatar small"></div>' +
        '<div class="comment-body"><div class="comment-meta"><strong></strong>' +
        '<span class="chip"></span><small></small></div><p></p></div>' +
        (c.mine ? '<button type="button" class="delete-button">Delete</button>' : '');

    // textContent (not innerHTML) so typed text can never run as code
    comment.querySelector(".thread-avatar").textContent = c.author.charAt(0).toUpperCase();
    comment.querySelector("strong").textContent = c.author;
    const chip = comment.querySelector(".chip");
    chip.classList.add(isMember ? "member" : "student");
    chip.textContent = isMember ? "Organization Member" : "Student";
    comment.querySelector("small").textContent = timeAgo(c.createdAt);
    comment.querySelector("p").textContent = c.body;
    if (!c.body) comment.querySelector("p").remove();           // a picture with no text
    if (c.fileName) {
        comment.querySelector(".comment-body").appendChild(buildAttachment("comment", c.id, c.fileName));
    }

    // students can delete their own comments (the server checks this too)
    const del = comment.querySelector(".delete-button");
    if (del) {
        del.addEventListener("click", async function () {
            if (!confirm("Delete your comment?")) return;
            del.disabled = true;
            try {
                const response = await fetch("feedback?type=comment&id=" + c.id, { method: "DELETE" });
                if (response.status === 403) { showToast("You can only delete your own comments."); del.disabled = false; return; }
                if (!response.ok && response.status !== 404) throw new Error();
                showToast("Comment deleted.");
                reload();
            } catch (error) {
                del.disabled = false;
                showToast("Could not delete the comment. Please try again.");
            }
        });
    }
    return comment;
}

function buildThread(post, drafts) {
    const thread = document.createElement("article");
    thread.className = "thread";
    thread.dataset.id = post.id;
    thread.innerHTML =
        '<div class="thread-head"><div class="thread-avatar"></div>' +
        '<div class="thread-meta"><strong></strong><span class="chip student">Student</span><small></small></div>' +
        '<span class="status"></span></div>' +
        '<p class="thread-text"></p>' +
        '<div class="thread-tags"><span class="comment-count"></span></div>' +
        '<div class="comment-list"></div>' +
        '<form class="comment-form"><input type="text" maxlength="1000" placeholder="Write a comment...">' +
        '<label class="attach-button" title="Attach a picture or file"><span>Attach</span>' +
        '<input type="file" class="attach-input" accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.ppt,.pptx,.doc,.docx"></label>' +
        '<button type="submit" class="submit-button">Comment</button></form>';

    thread.querySelector(".thread-avatar").textContent = post.author.charAt(0).toUpperCase();
    thread.querySelector(".thread-meta strong").textContent = post.author;
    thread.querySelector(".thread-meta small").textContent = timeAgo(post.createdAt);
    thread.querySelector(".thread-text").textContent = post.body;
    if (!post.body) thread.querySelector(".thread-text").remove();     // a picture with no text
    if (post.fileName) {
        thread.querySelector(".thread-tags").before(buildAttachment("post", post.id, post.fileName));   // under the text
    }

    const answered = post.comments.length > 0;
    const status = thread.querySelector(".status");
    status.textContent = answered ? "Answered" : "Open";
    status.classList.add(answered ? "resolved" : "pending");

    const n = post.comments.length;
    thread.querySelector(".comment-count").textContent = n + (n === 1 ? " comment" : " comments");

    const list = thread.querySelector(".comment-list");
    post.comments.forEach(function (c) { list.appendChild(buildComment(c, loadFeedback)); });

    const form = thread.querySelector(".comment-form");
    const input = form.querySelector("input");                 // the first input is the text box
    const attach = form.querySelector(".attach-input");
    const attachLabel = form.querySelector(".attach-button");
    if (drafts[post.id]) input.value = drafts[post.id];

    // show the chosen file's name on the Attach button
    attach.addEventListener("change", function () {
        const file = attach.files[0];
        attachLabel.querySelector("span").textContent = file ? file.name : "Attach";
        attachLabel.classList.toggle("has-file", !!file);
    });

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const text = input.value.trim();
        const file = attach.files[0];
        if (!text && !file) { showToast("Write a comment or attach a file."); return; }
        if (file && file.size > MAX_FEEDBACK_FILE) { showToast("That file is too big. The limit is 10 MB."); return; }

        try {
            const data = new FormData();            // FormData lets text and a file travel together
            data.append("postId", post.id);
            data.append("body", text);
            if (file) data.append("file", file);

            const response = await fetch("feedback", { method: "POST", body: data });
            if (response.status === 404) {
                showToast("That request was removed.");
                loadFeedback();
                return;
            }
            if (response.status === 413) { showToast("That file is too big. The limit is 10 MB."); return; }
            if (response.status === 400) {
                showToast("That file type isn't allowed. Use a picture, PDF, Word or PowerPoint file.");
                return;
            }
            if (!response.ok) throw new Error();

            input.value = "";
            showToast("Comment posted.");
            loadFeedback();
        } catch (error) {
            showToast("Could not post the comment. Please try again.");
        }
    });

    return thread;
}

function loadFeedback() {
    // keep half-typed comments when the board refreshes
    const drafts = {};
    feedbackList.querySelectorAll(".thread").forEach(function (t) {
        const value = t.querySelector(".comment-form input").value;
        if (value) drafts[t.dataset.id] = value;
    });

    fetch("feedback")
        .then(function (response) {
            if (response.status === 401) { window.location.replace("obligeU.html"); return null; }
            if (!response.ok) throw new Error();
            return response.json();
        })
        .then(function (posts) {
            if (!posts) return;
            feedbackList.innerHTML = "";
            if (posts.length === 0) {
                feedbackList.appendChild(emptyNote("No feedback requests yet. Be the first to ask."));
            }
            posts.forEach(function (post) { feedbackList.appendChild(buildThread(post, drafts)); });
        })
        .catch(function () {
            feedbackList.innerHTML = "";
            feedbackList.appendChild(emptyNote("Could not load the feedback board."));
        });
}

const feedbackFile = document.getElementById("feedbackFile");
const feedbackFileName = document.getElementById("feedbackFileName");

// show the chosen file's name inside the dashed box
function showFeedbackFileName() {
    const file = feedbackFile.files[0];
    feedbackFileName.textContent = file ? file.name : "Choose a picture or file";
    feedbackFileName.closest(".file-drop").classList.toggle("has-file", !!file);
}
feedbackFile.addEventListener("change", showFeedbackFileName);

document.getElementById("feedbackForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const form = this;
    const body = document.getElementById("feedbackBody").value.trim();
    const file = feedbackFile.files[0];

    if (!body && !file) {
        showToast("Write something or attach a file first.");
        return;
    }
    if (file && file.size > MAX_FEEDBACK_FILE) {
        showToast("That file is too big. The limit is 10 MB.");
        return;
    }

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;

    try {
        const data = new FormData();
        data.append("body", body);
        if (file) data.append("file", file);

        const response = await fetch("feedback", { method: "POST", body: data });
        if (response.status === 403) { showToast("Only students can post feedback requests."); return; }
        if (response.status === 413) { showToast("That file is too big. The limit is 10 MB."); return; }
        if (response.status === 400) {
            showToast("That file type isn't allowed. Use a picture, PDF, Word or PowerPoint file.");
            return;
        }
        if (!response.ok) throw new Error();

        form.reset();
        showFeedbackFileName();      // reset() doesn't fire "change", so clear the box ourselves
        showToast("Posted to the Feedback Board.");
        loadFeedback();
    } catch (error) {
        showToast("Could not post your request. Please try again.");
    } finally {
        button.disabled = false;
    }
});

// true while someone has picked a file in a comment box but not sent it yet
function hasPendingFile() {
    return Array.from(feedbackList.querySelectorAll(".attach-input")).some(function (i) {
        return i.files.length > 0;
    });
}

loadFeedback();
// pick up new answers without a manual refresh
setInterval(function () {
    const typing = feedbackList.contains(document.activeElement);
    if (!document.hidden && !typing && !hasPendingFile()) loadFeedback();
}, 30000);


// ========== UPLOAD A FILE (saved to the database; matched to help requests) ==========
const uploadModal = document.getElementById("uploadModal");
const uploadForm = document.getElementById("uploadForm");
const uploadFile = document.getElementById("uploadFile");
const uploadFileName = document.getElementById("uploadFileName");
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function openUpload() {
    uploadModal.classList.add("active");
    setTimeout(function () { document.getElementById("uploadTitle").focus(); }, 100);
}

function closeUpload() {
    uploadModal.classList.remove("active");
}

document.querySelectorAll("[data-upload]").forEach(function (button) {
    button.addEventListener("click", openUpload);
});
document.getElementById("closeUpload").addEventListener("click", closeUpload);
uploadModal.addEventListener("click", function (event) {
    if (event.target === uploadModal) closeUpload();
});

// show the chosen file's name inside the picker
uploadFile.addEventListener("change", function () {
    const file = uploadFile.files[0];
    uploadFileName.textContent = file ? file.name : "Choose a file";
    uploadFileName.closest(".file-drop").classList.toggle("has-file", !!file);
});

uploadForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const title = document.getElementById("uploadTitle").value.trim();
    const subject = document.getElementById("uploadSubject").value;
    const keywords = document.getElementById("uploadKeywords").value.trim();
    const file = uploadFile.files[0];

    if (!title || !subject || !keywords || !file) {
        showToast("Please complete all fields.");
        return;
    }
    if (file.size > MAX_FILE_BYTES) {
        showToast("That file is over 25 MB.");
        return;
    }

    const data = new FormData();
    data.append("title", title);
    data.append("subject", subject);
    data.append("keywords", keywords);
    data.append("file", file);

    const button = uploadForm.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Uploading...";

    try {
        const response = await fetch("presentations", { method: "POST", body: data });

        if (response.status === 401) { window.location.replace("obligeU.html"); return; }
        if (response.status === 403) { showToast("Your account can't upload files."); return; }
        if (response.status === 413) { showToast("That file is too large (25 MB max)."); return; }
        if (response.status === 400) { showToast("Check the fields. Allowed files: ppt, pptx, pdf, doc, docx."); return; }
        if (!response.ok) throw new Error();

        uploadForm.reset();
        uploadFileName.textContent = "Choose a file";
        uploadFile.closest(".field").querySelector(".file-drop").classList.remove("has-file");
        closeUpload();
        showToast("Uploaded. Others can now be matched to your file.");
        loadRequests();   // my own older requests may match it
    } catch (error) {
        showToast("Could not upload the file. Please try again.");
    } finally {
        button.disabled = false;
        button.textContent = "Upload File";
    }
});


// ========== VIRTUAL HELP (saved to the database; the call page is call.html) ==========

const virtualSchedule = document.getElementById("virtualSchedule");
const virtualList = document.getElementById("virtualList");

// earliest allowed time = now (adjusted for the local time zone)
const now = new Date();
now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
virtualSchedule.min = now.toISOString().slice(0, 16);

// sends one of the small actions (cancel / finish) to the servlet
async function sessionAction(action, id) {
    const response = await fetch("virtual-help", {
        method: "POST",
        body: new URLSearchParams({ action: action, id: id })
    });
    if (response.status === 401) { window.location.replace("obligeU.html"); return false; }
    if (response.status === 404) { showToast("That session has already changed."); }
    else if (!response.ok) { showToast("Something went wrong. Please try again."); return false; }
    return true;
}

function buildSession(s, i) {
    const item = document.createElement("div");
    item.className = "full-request stacked";
    item.innerHTML =
        '<div class="request-line">' +
        '<div class="request-topic-icon"></div>' +
        '<div class="request-info"><h3></h3><span></span></div></div>';

    const icon = item.querySelector(".request-topic-icon");
    icon.classList.add(iconColors[i % iconColors.length]);
    icon.textContent = s.topic.substring(0, 2).toUpperCase();
    item.querySelector("h3").textContent = s.topic;

    const when = new Date(s.scheduledAt.replace(" ", "T")).toLocaleString("en-US", {
        dateStyle: "medium", timeStyle: "short"
    });
    item.querySelector(".request-info span").textContent = s.subject + " · " + when;

    const line = item.querySelector(".request-line");

    // status chip
    const chip = document.createElement("span");
    chip.className = "status " + (s.status === "waiting" ? "pending" : "resolved");
    chip.textContent = s.status === "waiting" ? "Waiting for a helper"
                     : s.status === "active"  ? "Helper joined"
                     : "Finished";
    line.appendChild(chip);

    // buttons depend on the status
    if (s.status === "waiting") {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "link-button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", async function () {
            if (!confirm("Cancel this request?")) return;
            if (await sessionAction("cancel", s.id)) { showToast("Request cancelled."); loadVirtual(); }
        });
        line.appendChild(cancel);
    }

    if (s.status === "active") {
        const join = document.createElement("button");
        join.type = "button";
        join.className = "download-button";
        join.textContent = "Join call";
        join.addEventListener("click", function () {
            window.open("call.html?id=" + s.id, "_blank");
        });

        const end = document.createElement("button");
        end.type = "button";
        end.className = "link-button";
        end.textContent = "End session";
        end.addEventListener("click", async function () {
            if (!confirm("End this session?")) return;
            if (await sessionAction("finish", s.id)) { showToast("Session ended."); loadVirtual(); }
        });

        line.appendChild(join);
        line.appendChild(end);
    }
    return item;
}

function loadVirtual() {
    fetch("virtual-help")
        .then(function (response) {
            if (response.status === 401) { window.location.replace("obligeU.html"); return null; }
            if (!response.ok) throw new Error();
            return response.json();
        })
        .then(function (sessions) {
            if (!sessions) return;
            virtualList.innerHTML = "";
            if (sessions.length === 0) {
                virtualList.appendChild(emptyNote("You haven't requested a virtual session yet."));
            }
            sessions.forEach(function (s, i) { virtualList.appendChild(buildSession(s, i)); });
        })
        .catch(function () {
            virtualList.innerHTML = "";
            virtualList.appendChild(emptyNote("Could not load your sessions."));
        });
}

document.getElementById("virtualForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const form = this;
    const subject = document.getElementById("virtualSubject").value;
    const topic = document.getElementById("virtualTopic").value.trim();
    const schedule = virtualSchedule.value;

    if (!subject || !topic || !schedule) {
        showToast("Please complete all fields.");
        return;
    }

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;

    try {
        const response = await fetch("virtual-help", {
            method: "POST",
            body: new URLSearchParams({ subject: subject, topic: topic, schedule: schedule })
        });

        if (response.status === 401) { window.location.replace("obligeU.html"); return; }
        if (response.status === 403) { showToast("Only students can request virtual help."); return; }
        if (response.status === 400) { showToast("Please check your details and try again."); return; }
        if (!response.ok) throw new Error();

        form.reset();
        showToast("Request sent. A helper can now join your session.");
        loadVirtual();
    } catch (error) {
        showToast("Could not send your request. Please try again.");
    } finally {
        button.disabled = false;
    }
});

loadVirtual();
// the "Join call" button appears when a helper takes the request, so keep checking
setInterval(function () {
    if (!document.hidden) loadVirtual();
}, 10000);


// ========== LEARNING MATERIALS ==========
document.querySelectorAll(".material-filter").forEach(function (filter) {
    filter.addEventListener("click", function () {
        document.querySelectorAll(".material-filter").forEach(function (f) {
            f.classList.remove("active");
        });
        filter.classList.add("active");

        document.querySelectorAll(".material-card").forEach(function (card) {
            const match = filter.dataset.filter === "all" || card.dataset.category === filter.dataset.filter;
            card.style.display = match ? "" : "none";
        });
    });
});

const materialInfo = {
    "Java ArrayList Guide": {
        text: "A quick study resource covering ArrayList concepts, adding elements, removing elements, accessing values, and basic examples.",
        category: "Object Oriented Programming"
    },
    "SQL Fundamentals": {
        text: "Review SQL queries, tables, joins, filtering, and basic database concepts.",
        category: "Advance Database System"
    },
    "Probability Reviewer": {
        text: "Review sample spaces, events, probability expressions, and basic probability concepts.",
        category: "Discrete Structure"
    },
    "HTML & CSS Basics": {
        text: "Review webpage structure, HTML elements, CSS selectors, layout, and basic styling concepts.",
        category: "Human Computer Interaction"
    }
};

document.querySelectorAll(".material-button").forEach(function (button) {
    button.addEventListener("click", function () {
        const title = button.closest(".material-card").querySelector("h3").textContent.trim();
        const info = materialInfo[title];

        if (info) {
            openModal("LEARNING MATERIAL", title, info.text, info.category);
        } else {
            showToast("Learning material will open here.");
        }
    });
});


// ========== ESCAPE KEY ==========
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        closeModal();
        closeUpload();
        notificationPanel.classList.remove("active");
    }
});


// ========== CURRENT USER (names change per account) ==========
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

fetch("me")
    .then(function (response) {
        if (response.status === 401) { window.location.replace("obligeU.html"); return null; }
        if (!response.ok) throw new Error("me returned " + response.status);
        return response.json();
    })
    .then(function (user) {
        if (!user) return;
        // wrong or missing role: send them where they belong
        if (user.role === null) {
            window.location.replace("obligeU.html");
            return;
        }
        if (user.role !== "student") {
            window.location.replace("orgDashboard.html");
            return;
        }

        const initial = user.firstName.charAt(0).toUpperCase();

        setText("sidebarName", user.firstName);
        setText("topName", user.firstName);
        setText("welcomeName", user.firstName);
        setText("sidebarAvatar", initial);
        setText("topAvatar", initial);
        setText("profileAvatar", initial);
        setText("profileName", user.firstName + " " + user.lastName);
        setText("profileEmail", user.email);
        setText("profileFirstName", user.firstName);
        setText("profileLastName", user.lastName);
    })
    .catch(function (error) {
        // a real error: stay on the page so it can be seen in the Console
        console.error("Could not load the current user:", error);
    });


// ========== LOG OUT ==========
document.getElementById("logoutButton").addEventListener("click", async function () {
    try {
        const response = await fetch("logout", { method: "POST" });
        if (!response.ok) throw new Error();

        window.location.href = "obligeU.html";
    } catch (error) {
        showToast("Could not log out. Please try again.");
    }
});
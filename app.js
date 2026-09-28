
/* =========================================================
   SMARTATTEND - app.js
   COMPLETE VERSION
   MATCHES SMARTATTEND Code.gs
========================================================= */

const API_URL =
  "https://script.google.com/macros/s/AKfycbzTX9hyFs1CYRKOS31pZ893nuY94IEL3nApc4FvR80iM6kXdNqzmtKzQn8ddRWhBGG4/exec";


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentInstructor = null;
let subjects = [];
let selectedSubject = null;

let selectedDashboardSubjectID = "";
let selectedStudentsSubjectID = "";

let studentCameraStream = null;
let attendanceCameraStream = null;
let attendanceScanTimer = null;

let attendanceRecognitionBusy = false;
let attendancePopupOpen = false;
let messagePopupOpen = false;

let faceModelsLoaded = false;
let faceModelsPromise = null;
let faceApiLoadPromise = null;

let attendanceMatcherCache = {};
let attendanceRecordedStudents = new Set();

let lastRecognizedStudentID = "";
let lastRecognitionTime = 0;


/* =========================================================
   FACE API SETTINGS
========================================================= */

const FACE_MODEL_URL =
  "https://justadudewhohacks.github.io/face-api.js/models";

const FACE_MATCH_THRESHOLD = 0.60;
const RECOGNITION_COOLDOWN = 5000;
const ATTENDANCE_SCAN_INTERVAL = 900;


/* =========================================================
   DOM HELPER
========================================================= */

function $(id) {
  return document.getElementById(id);
}


/* =========================================================
   TEXT HELPER
========================================================= */

function setText(id, value) {

  const element = $(id);

  if (!element) return;

  element.textContent =
    value == null ? "" : String(value);
}


/* =========================================================
   SHOW / HIDE
========================================================= */

function showElement(element) {

  if (!element) return;

  element.classList.remove("hidden");
}


function hideElement(element) {

  if (!element) return;

  element.classList.add("hidden");
}


/* =========================================================
   MESSAGE
========================================================= */

function showMessage(
  message,
  type = "info",
  targetId = "message"
) {

  const element = $(targetId);

  if (!element) return;

  element.textContent = message || "";

  element.classList.remove(
    "success",
    "error",
    "warning",
    "info"
  );

  element.classList.add(type);
}


function clearMessage(targetId) {

  const element = $(targetId);

  if (!element) return;

  element.textContent = "";
}


/* =========================================================
   GENERAL POPUP
========================================================= */

function showMessagePopup(
  title,
  message,
  type = "success"
) {

  const popup = $("messagePopup");

  const titleElement =
    $("messagePopupTitle");

  const messageElement =
    $("messagePopupMessage");

  if (!popup) return;

  if (titleElement) {
    titleElement.textContent =
      title || "Message";
  }

  if (messageElement) {
    messageElement.textContent =
      message || "";
  }

  const box =
    popup.querySelector(".popup-box");

  if (box) {

    box.classList.remove(
      "popup-success",
      "popup-warning",
      "popup-error"
    );

    if (type === "error") {

      box.classList.add(
        "popup-error"
      );

    } else if (type === "warning") {

      box.classList.add(
        "popup-warning"
      );

    } else {

      box.classList.add(
        "popup-success"
      );

    }
  }

  popup.classList.remove("hidden");

  popup.setAttribute(
    "aria-hidden",
    "false"
  );

  messagePopupOpen = true;
}


function closeMessagePopup() {

  const popup =
    $("messagePopup");

  if (!popup) return;

  popup.classList.add("hidden");

  popup.setAttribute(
    "aria-hidden",
    "true"
  );

  messagePopupOpen = false;
}


/* =========================================================
   ATTENDANCE POPUP
========================================================= */

function showAttendancePopup(
  title,
  message,
  type = "success"
) {

  const popup =
    $("attendancePopup");

  const titleElement =
    $("attendancePopupTitle");

  const messageElement =
    $("attendancePopupMessage");

  const box =
    $("attendancePopupBox");

  if (!popup) return;

  if (titleElement) {
    titleElement.textContent =
      title || "Attendance Saved";
  }

  if (messageElement) {
    messageElement.textContent =
      message || "";
  }

  if (box) {

    box.classList.remove(
      "popup-success",
      "popup-warning",
      "popup-error"
    );

    if (type === "error") {

      box.classList.add(
        "popup-error"
      );

    } else if (type === "warning") {

      box.classList.add(
        "popup-warning"
      );

    } else {

      box.classList.add(
        "popup-success"
      );

    }
  }

  popup.classList.remove("hidden");

  popup.setAttribute(
    "aria-hidden",
    "false"
  );

  attendancePopupOpen = true;
}


function closeAttendancePopup() {

  const popup =
    $("attendancePopup");

  if (!popup) return;

  popup.classList.add("hidden");

  popup.setAttribute(
    "aria-hidden",
    "true"
  );

  attendancePopupOpen = false;
}


/* =========================================================
   API REQUEST
========================================================= */

async function apiRequest(payload) {

  const response =
    await fetch(
      API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },

        body:
          JSON.stringify(payload)
      }
    );

  if (!response.ok) {

    throw new Error(
      `Server request failed (${response.status}).`
    );
  }

  const result =
    await response.json();

  if (
    result &&
    result.success === false
  ) {

    throw new Error(
      result.message ||
      "Server request failed."
    );
  }

  return result;
}


/* =========================================================
   FACE DETECTION OPTIONS
========================================================= */

function getFaceDetectionOptions() {

  return new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    minConfidence: 0.35
  });
}


/* =========================================================
   LOAD FACE API
========================================================= */

async function ensureFaceApiLoaded() {

  if (window.faceapi) {
    return window.faceapi;
  }

  if (faceApiLoadPromise) {
    return faceApiLoadPromise;
  }

  faceApiLoadPromise =
    new Promise(
      (resolve, reject) => {

        const script =
          document.createElement("script");

        script.src =
          "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";

        script.onload = () => {

          if (window.faceapi) {

            resolve(window.faceapi);

          } else {

            reject(
              new Error(
                "Face recognition library loaded but was not initialized."
              )
            );
          }
        };

        script.onerror = () => {

          reject(
            new Error(
              "Unable to load face recognition library."
            )
          );
        };

        document.head.appendChild(script);
      }
    );

  return faceApiLoadPromise;
}


/* =========================================================
   LOAD FACE MODELS
========================================================= */

async function loadFaceModels() {

  await ensureFaceApiLoaded();

  if (faceModelsLoaded) {
    return;
  }

  if (faceModelsPromise) {
    return faceModelsPromise;
  }

  faceModelsPromise =
    (async () => {

      await Promise.all([

        faceapi.nets.tinyFaceDetector
          .loadFromUri(
            FACE_MODEL_URL
          ),

        faceapi.nets.faceLandmark68Net
          .loadFromUri(
            FACE_MODEL_URL
          ),

        faceapi.nets.faceRecognitionNet
          .loadFromUri(
            FACE_MODEL_URL
          )

      ]);

      faceModelsLoaded = true;

    })()
      .catch(error => {

        faceModelsPromise = null;

        throw error;
      });

  return faceModelsPromise;
}


/* =========================================================
   NORMALIZE INSTRUCTOR
========================================================= */

function normalizeInstructor(instructor) {

  if (!instructor) {
    return null;
  }

  const instructorID =
    String(
      instructor.instructorID ||
      instructor.InstructorID ||
      instructor.id ||
      ""
    ).trim();

  const name =
    String(
      instructor.name ||
      instructor.Name ||
      ""
    ).trim();

  const email =
    String(
      instructor.email ||
      instructor.Email ||
      ""
    ).trim();

  if (!instructorID) {
    return null;
  }

  return {
    instructorID,
    name,
    email
  };
}


/* =========================================================
   NORMALIZE SUBJECT
========================================================= */

function normalizeSubject(subject) {

  if (!subject) {
    return null;
  }

  let days = [];

  if (Array.isArray(subject.days)) {

    days = subject.days;

  } else {

    days =
      String(
        subject.days ||
        subject.Days ||
        ""
      )
        .split(",")
        .map(day => day.trim())
        .filter(Boolean);
  }

  return {

    subjectID:
      String(
        subject.subjectID ||
        subject.SubjectID ||
        ""
      ).trim(),

    instructorID:
      String(
        subject.instructorID ||
        subject.InstructorID ||
        ""
      ).trim(),

    subjectCode:
      String(
        subject.subjectCode ||
        subject.SubjectCode ||
        ""
      ).trim(),

    subjectName:
      String(
        subject.subjectName ||
        subject.SubjectName ||
        ""
      ).trim(),

    section:
      String(
        subject.section ||
        subject.Section ||
        ""
      ).trim(),

    program:
      String(
        subject.program ||
        subject.Program ||
        ""
      ).trim(),

    schedule:
      String(
        subject.schedule ||
        subject.Schedule ||
        ""
      ).trim(),

    days,

    startTime:
      String(
        subject.startTime ||
        subject.StartTime ||
        ""
      ).trim(),

    endTime:
      String(
        subject.endTime ||
        subject.EndTime ||
        ""
      ).trim()
  };
}


/* =========================================================
   NORMALIZE STUDENT
========================================================= */

function normalizeStudent(student) {

  if (!student) {
    return null;
  }

  return {

    studentID:
      String(
        student.studentID ||
        student.StudentID ||
        ""
      ).trim(),

    name:
      String(
        student.name ||
        student.Name ||
        ""
      ).trim(),

    program:
      String(
        student.program ||
        student.Program ||
        ""
      ).trim(),

    photoFileID:
      String(
        student.photoFileID ||
        student.PhotoFileID ||
        ""
      ).trim(),

    photoURL:
      String(
        student.photoURL ||
        student.PhotoURL ||
        ""
      ).trim(),

    photoData:
      String(
        student.photoData ||
        student.PhotoData ||
        ""
      ).trim()
  };
}


/* =========================================================
   INSTRUCTOR REGISTRATION
========================================================= */

async function registerInstructor(event) {

  event.preventDefault();

  const name =
    String(
      $("instructorNameInput")?.value ||
      ""
    ).trim();

  const email =
    String(
      $("instructorEmailInput")?.value ||
      ""
    ).trim();

  const password =
    String(
      $("instructorPasswordInput")?.value ||
      ""
    ).trim();


  if (!name) {

    showMessage(
      "Instructor name is required.",
      "error",
      "registerMessage"
    );

    return;
  }


  if (!email) {

    showMessage(
      "Email is required.",
      "error",
      "registerMessage"
    );

    return;
  }


  if (!password) {

    showMessage(
      "Password is required.",
      "error",
      "registerMessage"
    );

    return;
  }


  if (
    password.length < 4
  ) {

    showMessage(
      "Password must be at least 4 characters.",
      "error",
      "registerMessage"
    );

    return;
  }


  try {

    showMessage(
      "Registering instructor...",
      "info",
      "registerMessage"
    );


    const result =
      await apiRequest({

        action:
          "registerInstructor",

        name,

        email,

        password

      });


    showMessage(
      result.message ||
      "Instructor registered successfully.",
      "success",
      "registerMessage"
    );


    const form =
      $("registerInstructorForm");

    if (form) {
      form.reset();
    }


    /*
     * Go back to login after successful registration.
     */

    setTimeout(
      () => {

        $("registerInstructorPage")
          ?.classList.add("hidden");

        $("loginPage")
          ?.classList.remove("hidden");


        if ($("loginEmail")) {

          $("loginEmail").value =
            email;
        }


        if ($("loginPassword")) {

          $("loginPassword").value =
            "";
        }


        clearMessage(
          "registerMessage"
        );

      },
      1200
    );


  } catch (error) {

    console.error(
      "Instructor registration error:",
      error
    );

    showMessage(
      error.message ||
      "Instructor registration failed.",
      "error",
      "registerMessage"
    );
  }
}


/* =========================================================
   SHOW REGISTRATION PAGE
========================================================= */

function showInstructorRegistration(event) {

  if (event) {
    event.preventDefault();
  }

  $("loginPage")
    ?.classList.add("hidden");

  $("registerInstructorPage")
    ?.classList.remove("hidden");

  clearMessage("message");
  clearMessage("registerMessage");
}


/* =========================================================
   SHOW LOGIN PAGE
========================================================= */

function showLoginPage(event) {

  if (event) {
    event.preventDefault();
  }

  $("registerInstructorPage")
    ?.classList.add("hidden");

  $("loginPage")
    ?.classList.remove("hidden");

  clearMessage("message");
  clearMessage("registerMessage");
}


/* =========================================================
   LOGIN
========================================================= */

async function loginInstructor(
  email,
  password
) {

  const result =
    await apiRequest({

      action:
        "loginInstructor",

      email,
      password

    });


  currentInstructor =
    normalizeInstructor(
      result.instructor
    );


  if (!currentInstructor) {

    throw new Error(
      "Instructor ID was not returned by the server."
    );
  }


  localStorage.setItem(
    "smartAttendInstructor",
    JSON.stringify(
      currentInstructor
    )
  );


  setText(
    "instructorName",
    currentInstructor.name
  );


  return currentInstructor;
}


/* =========================================================
   RESTORE LOGIN
========================================================= */

function restoreInstructor() {

  try {

    const stored =
      localStorage.getItem(
        "smartAttendInstructor"
      );


    if (!stored) {
      return false;
    }


    const instructor =
      JSON.parse(stored);


    currentInstructor =
      normalizeInstructor(
        instructor
      );


    if (!currentInstructor) {

      localStorage.removeItem(
        "smartAttendInstructor"
      );

      return false;
    }


    setText(
      "instructorName",
      currentInstructor.name
    );


    return true;


  } catch (error) {

    localStorage.removeItem(
      "smartAttendInstructor"
    );

    return false;
  }
}


/* =========================================================
   LOGOUT
========================================================= */

function logout() {

  stopStudentCamera();
  stopAttendanceCamera();

  currentInstructor = null;
  selectedSubject = null;
  subjects = [];

  attendanceMatcherCache = {};

  attendanceRecordedStudents =
    new Set();

  localStorage.removeItem(
    "smartAttendInstructor"
  );


  $("app")
    ?.classList.add("hidden");

  $("loginPage")
    ?.classList.remove("hidden");
}


/* =========================================================
   NAVIGATION
========================================================= */

function showPage(pageName) {

  document
    .querySelectorAll(".page")
    .forEach(page => {

      page.classList.add("hidden");

    });


  const page = $(pageName);

  if (page) {

    page.classList.remove(
      "hidden"
    );
  }


  if (
    pageName !==
    "registerStudentPage"
  ) {

    stopStudentCamera();
  }


  if (
    pageName !==
    "attendancePage"
  ) {

    stopAttendanceCamera();
  }


  if (
    pageName ===
    "dashboardPage"
  ) {

    loadDashboard();
  }


  if (
    pageName ===
    "subjectsPage"
  ) {

    loadSubjects();
  }


  if (
    pageName ===
    "registerStudentPage"
  ) {

    startStudentCamera();
  }


  if (
    pageName ===
    "studentsPage"
  ) {

    loadStudentsPage();
  }


  if (
    pageName ===
    "attendancePage"
  ) {

    prepareAttendancePage();
  }
}


/* =========================================================
   LOAD SUBJECTS
========================================================= */

async function loadSubjects() {

  if (
    !currentInstructor ||
    !currentInstructor.instructorID
  ) {

    showMessage(
      "Instructor ID is required.",
      "error",
      "subjectMessage"
    );

    return;
  }


  try {

    const result =
      await apiRequest({

        action:
          "getSubjects",

        instructorID:
          currentInstructor.instructorID
      });


    subjects =
      (result.subjects || [])
        .map(normalizeSubject)
        .filter(
          subject =>
            subject &&
            subject.subjectID
        );


    renderSubjects();

    populateSubjectSelects();


  } catch (error) {

    showMessage(
      error.message,
      "error",
      "subjectMessage"
    );
  }
}


/* =========================================================
   RENDER SUBJECTS
========================================================= */

function renderSubjects() {

  const container =
    $("subjectsList");

  if (!container) return;

  container.innerHTML = "";


  if (!subjects.length) {

    container.textContent =
      "No subjects found.";

    return;
  }


  subjects.forEach(subject => {

    const item =
      document.createElement("div");

    item.className =
      "subject-item";


    item.innerHTML = `

      <div>

        <strong>
          ${escapeHTML(
            subject.subjectCode
          )}
        </strong>

        <div>
          ${escapeHTML(
            subject.subjectName
          )}
        </div>

        <div>
          Section:
          ${escapeHTML(
            subject.section
          )}
        </div>

        <div>
          Program:
          ${escapeHTML(
            subject.program
          )}
        </div>

        <div>
          Schedule:
          ${escapeHTML(
            subject.schedule
          )}
        </div>

      </div>

      <button
        type="button"
        class="edit-subject-button"
        data-subject-id="${escapeAttribute(
          subject.subjectID
        )}"
      >
        Edit
      </button>

    `;


    container.appendChild(item);
  });


  container
    .querySelectorAll(
      ".edit-subject-button"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          editSubject(
            button.dataset.subjectId
          );

        }
      );

    });
}


/* =========================================================
   EDIT SUBJECT
========================================================= */

function editSubject(subjectID) {

  const subject =
    subjects.find(
      item =>
        item.subjectID ===
        subjectID
    );


  if (!subject) {

    showMessage(
      "Subject not found.",
      "error",
      "subjectMessage"
    );

    return;
  }


  $("subjectID").value =
    subject.subjectID;

  $("subjectCode").value =
    subject.subjectCode;

  $("subjectName").value =
    subject.subjectName;

  $("section").value =
    subject.section;

  $("program").value =
    subject.program;

  $("startTime").value =
    subject.startTime;

  $("endTime").value =
    subject.endTime;


  document
    .querySelectorAll(
      'input[name="days"]'
    )
    .forEach(checkbox => {

      checkbox.checked =
        subject.days.includes(
          checkbox.value
        );

    });


  showPage(
    "subjectsPage"
  );
}


/* =========================================================
   SAVE SUBJECT
========================================================= */

async function saveSubject(event) {

  event.preventDefault();


  if (
    !currentInstructor ||
    !currentInstructor.instructorID
  ) {

    showMessage(
      "Instructor ID is required.",
      "error",
      "subjectMessage"
    );

    return;
  }


  const subjectID =
    String(
      $("subjectID")?.value ||
      ""
    ).trim();

  const subjectCode =
    String(
      $("subjectCode")?.value ||
      ""
    ).trim();

  const subjectName =
    String(
      $("subjectName")?.value ||
      ""
    ).trim();

  const section =
    String(
      $("section")?.value ||
      ""
    ).trim();

  const program =
    String(
      $("program")?.value ||
      ""
    ).trim();

  const days =
    Array.from(
      document.querySelectorAll(
        'input[name="days"]:checked'
      )
    ).map(
      checkbox =>
        checkbox.value
    );

  const startTime =
    String(
      $("startTime")?.value ||
      ""
    ).trim();

  const endTime =
    String(
      $("endTime")?.value ||
      ""
    ).trim();


  try {

    let result;


    if (subjectID) {

      result =
        await apiRequest({

          action:
            "updateSubject",

          instructorID:
            currentInstructor.instructorID,

          subjectID,

          subjectCode,

          subjectName,

          section,

          program,

          days,

          startTime,

          endTime
        });


    } else {

      result =
        await apiRequest({

          action:
            "addSubject",

          instructorID:
            currentInstructor.instructorID,

          subjectCode,

          subjectName,

          section,

          program,

          days,

          startTime,

          endTime
        });
    }


    showMessage(
      result.message ||
      "Subject saved successfully.",
      "success",
      "subjectMessage"
    );


    $("subjectForm")
      ?.reset();

    if ($("subjectID")) {

      $("subjectID").value =
        "";
    }


    await loadSubjects();


  } catch (error) {

    showMessage(
      error.message,
      "error",
      "subjectMessage"
    );
  }
}


/* =========================================================
   POPULATE SUBJECT SELECTS
========================================================= */

function populateSubjectSelects() {

  const selectIDs = [

    "dashboardSubject",
    "studentSubject",
    "studentsSubject",
    "attendanceSubject"

  ];


  selectIDs.forEach(id => {

    const select = $(id);

    if (!select) return;


    const previous =
      select.value;


    select.innerHTML = "";


    const defaultOption =
      document.createElement(
        "option"
      );

    defaultOption.value = "";

    defaultOption.textContent =
      "Select Subject";

    select.appendChild(
      defaultOption
    );


    subjects.forEach(subject => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        subject.subjectID;

      option.textContent =
        `${subject.subjectCode} - ${subject.subjectName}`;

      select.appendChild(option);
    });


    if (
      previous &&
      subjects.some(
        subject =>
          subject.subjectID ===
          previous
      )
    ) {

      select.value =
        previous;
    }

  });
}


/* =========================================================
   GET SUBJECT
========================================================= */

function getSubjectByID(subjectID) {

  return (
    subjects.find(
      subject =>
        subject.subjectID ===
        subjectID
    ) || null
  );
}


/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {

  if (
    !currentInstructor ||
    !currentInstructor.instructorID
  ) {

    return;
  }


  const subjectID =
    String(
      $("dashboardSubject")?.value ||
      selectedDashboardSubjectID ||
      ""
    ).trim();


  if (!subjectID) {

    clearDashboard();

    return;
  }


  selectedDashboardSubjectID =
    subjectID;


  const date =
    $("dashboardDate")?.value ||
    getTodayString();


  try {

    const result =
      await apiRequest({

        action:
          "getDashboard",

        instructorID:
          currentInstructor.instructorID,

        subjectID,

        date
      });


    renderDashboard(result);


  } catch (error) {

    showMessage(
      error.message,
      "error",
      "message"
    );
  }
}


/* =========================================================
   RENDER DASHBOARD
========================================================= */

function renderDashboard(result) {

  const counts =
    result.counts || {};


  setText(
    "presentCount",
    counts.present || 0
  );

  setText(
    "lateCount",
    counts.late || 0
  );

  setText(
    "absentCount",
    counts.absent || 0
  );

  setText(
    "waitingCount",
    counts.waiting || 0
  );


  const tableBody =
    $("dashboardTableBody");

  if (!tableBody) return;


  tableBody.innerHTML = "";


  const students =
    result.students || [];


  students.forEach(student => {

    const row =
      document.createElement("tr");


    row.innerHTML = `

      <td>
        ${escapeHTML(
          student.studentID
        )}
      </td>

      <td>
        ${escapeHTML(
          student.name
        )}
      </td>

      <td>
        ${escapeHTML(
          student.program
        )}
      </td>

      <td>
        ${escapeHTML(
          student.status
        )}
      </td>

      <td>
        ${escapeHTML(
          student.timeIn || ""
        )}
      </td>

      <td>

        <button
          type="button"
          class="edit-attendance-button"
          data-student-id="${escapeAttribute(
            student.studentID
          )}"
        >
          Edit
        </button>

      </td>

    `;


    tableBody.appendChild(row);
  });


  tableBody
    .querySelectorAll(
      ".edit-attendance-button"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          editAttendance(
            button.dataset.studentId
          );

        }
      );

    });
}


/* =========================================================
   CLEAR DASHBOARD
========================================================= */

function clearDashboard() {

  setText(
    "presentCount",
    0
  );

  setText(
    "lateCount",
    0
  );

  setText(
    "absentCount",
    0
  );

  setText(
    "waitingCount",
    0
  );


  const tableBody =
    $("dashboardTableBody");

  if (tableBody) {

    tableBody.innerHTML =
      "";
  }
}


/* =========================================================
   TODAY
========================================================= */

function getTodayString() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


/* =========================================================
   STUDENT CAMERA
========================================================= */

async function startStudentCamera() {

  const video =
    $("studentCamera");

  if (!video) return;


  stopStudentCamera();


  try {

    studentCameraStream =
      await navigator.mediaDevices
        .getUserMedia({

          video: {

            width: {
              ideal: 640
            },

            height: {
              ideal: 480
            },

            facingMode:
              "user"
          },

          audio: false
        });


    video.srcObject =
      studentCameraStream;


    await video.play();


  } catch (error) {

    showMessage(
      "Unable to access the camera. Please allow camera permission.",
      "error",
      "studentMessage"
    );
  }
}


/* =========================================================
   STOP STUDENT CAMERA
========================================================= */

function stopStudentCamera() {

  if (
    studentCameraStream
  ) {

    studentCameraStream
      .getTracks()
      .forEach(
        track =>
          track.stop()
      );

    studentCameraStream =
      null;
  }


  const video =
    $("studentCamera");

  if (video) {

    video.srcObject =
      null;
  }
}


/* =========================================================
   REGISTER STUDENT
========================================================= */

async function registerStudent(event) {

  event.preventDefault();


  if (
    !currentInstructor ||
    !currentInstructor.instructorID
  ) {

    showMessage(
      "Instructor ID is required.",
      "error",
      "studentMessage"
    );

    return;
  }


  const studentID =
    String(
      $("studentID")?.value ||
      ""
    ).trim();

  const name =
    String(
      $("studentName")?.value ||
      ""
    ).trim();

  const program =
    String(
      $("studentProgram")?.value ||
      ""
    ).trim();

  const subjectID =
    String(
      $("studentSubject")?.value ||
      ""
    ).trim();

  const video =
    $("studentCamera");

  const canvas =
    $("studentCanvas");


  if (!studentID) {

    showMessage(
      "Student ID is required.",
      "error",
      "studentMessage"
    );

    return;
  }


  if (!name) {

    showMessage(
      "Student name is required.",
      "error",
      "studentMessage"
    );

    return;
  }


  if (!subjectID) {

    showMessage(
      "Please select a subject.",
      "error",
      "studentMessage"
    );

    return;
  }


  if (
    !video ||
    !video.videoWidth
  ) {

    showMessage(
      "Camera is not ready.",
      "error",
      "studentMessage"
    );

    return;
  }


  try {

    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;


    const context =
      canvas.getContext("2d");


    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );


    const photoData =
      canvas.toDataURL(
        "image/jpeg",
        0.90
      );


    if ($("studentPhotoData")) {

      $("studentPhotoData").value =
        photoData;
    }


    const result =
      await apiRequest({

        action:
          "registerStudent",

        instructorID:
          currentInstructor.instructorID,

        subjectID,

        studentID,

        name,

        program,

        photoData
      });


    showMessage(
      result.message ||
      "Student registered successfully.",
      "success",
      "studentMessage"
    );


    $("studentForm")
      ?.reset();


    if ($("studentPhotoData")) {

      $("studentPhotoData").value =
        "";
    }


    attendanceMatcherCache = {};


  } catch (error) {

    showMessage(
      error.message,
      "error",
      "studentMessage"
    );
  }
}


/* =========================================================
   LOAD STUDENTS PAGE
========================================================= */

async function loadStudentsPage() {

  const subjectID =
    String(
      $("studentsSubject")?.value ||
      selectedStudentsSubjectID ||
      ""
    ).trim();


  if (!subjectID) {

    const container =
      $("studentsList");

    if (container) {

      container.textContent =
        "Select a subject.";
    }

    return;
  }


  selectedStudentsSubjectID =
    subjectID;


  try {

    const result =
      await apiRequest({

        action:
          "getSubjectStudents",

        instructorID:
          currentInstructor.instructorID,

        subjectID
      });


    renderStudentsList(
      result.students || []
    );


  } catch (error) {

    showMessage(
      error.message,
      "error",
      "message"
    );
  }
}


/* =========================================================
   RENDER STUDENTS
========================================================= */

function renderStudentsList(rawStudents) {

  const container =
    $("studentsList");

  if (!container) return;


  container.innerHTML = "";


  const students =
    rawStudents
      .map(normalizeStudent)
      .filter(
        student =>
          student &&
          student.studentID
      );


  if (!students.length) {

    container.textContent =
      "No students registered.";

    return;
  }


  students.forEach(student => {

    const item =
      document.createElement("div");

    item.className =
      "student-item";


    item.innerHTML = `

      <strong>
        ${escapeHTML(
          student.studentID
        )}
      </strong>

      <div>
        ${escapeHTML(
          student.name
        )}
      </div>

      <div>
        ${escapeHTML(
          student.program
        )}
      </div>

    `;


    container.appendChild(item);
  });
}


/* =========================================================
   PREPARE ATTENDANCE
========================================================= */

async function prepareAttendancePage() {

  const subjectID =
    String(
      $("attendanceSubject")?.value ||
      ""
    ).trim();


  stopAttendanceCamera();


  if (!subjectID) {

    selectedSubject = null;

    setText(
      "attendanceSchedule",
      "Select a subject."
    );

    return;
  }


  selectedSubject =
    getSubjectByID(
      subjectID
    );


  if (!selectedSubject) {

    setText(
      "attendanceSchedule",
      "Subject not found."
    );

    return;
  }


  setText(
    "attendanceSchedule",
    selectedSubject.schedule ||
    ""
  );


  try {

    await startAttendanceCamera();

  } catch (error) {

    showMessage(
      error.message,
      "error",
      "attendanceMessage"
    );
  }
}


/* =========================================================
   GET ATTENDANCE FACE MATCHER
========================================================= */

async function getAttendanceFaceMatcher(
  subjectID
) {

  if (
    attendanceMatcherCache[subjectID]
  ) {

    return attendanceMatcherCache[
      subjectID
    ];
  }


  if (
    !currentInstructor ||
    !currentInstructor.instructorID
  ) {

    throw new Error(
      "Instructor ID is required."
    );
  }


  const result =
    await apiRequest({

      action:
        "getSubjectStudents",

      instructorID:
        currentInstructor.instructorID,

      subjectID
    });


  const students =
    (result.students || [])
      .map(normalizeStudent)
      .filter(
        student =>
          student &&
          student.studentID
      );


  if (!students.length) {

    throw new Error(
      "No registered students were found for this subject."
    );
  }


  const labeledDescriptors = [];

  let usablePhotos = 0;


  for (
    const student of students
  ) {

    try {

      if (
        !student.photoData
      ) {

        console.warn(
          "No photoData for student:",
          student.studentID
        );

        continue;
      }


      const image =
        await faceapi.fetchImage(
          student.photoData
        );


      const detection =
        await faceapi
          .detectSingleFace(
            image,
            getFaceDetectionOptions()
          )
          .withFaceLandmarks()
          .withFaceDescriptor();


      if (!detection) {

        console.warn(
          "No face detected:",
          student.studentID
        );

        continue;
      }


      labeledDescriptors.push(

        new faceapi.LabeledFaceDescriptors(
          student.studentID,
          [
            detection.descriptor
          ]
        )

      );


      usablePhotos++;


    } catch (error) {

      console.warn(
        "Unable to process photo:",
        student.studentID,
        error
      );
    }
  }


  if (
    usablePhotos === 0
  ) {

    throw new Error(
      `${students.length} registered student(s), but none of their photos could be loaded or detected. Please register the student's face again and make sure the camera captured the face clearly.`
    );
  }


  const matcher =
    new faceapi.FaceMatcher(
      labeledDescriptors,
      FACE_MATCH_THRESHOLD
    );


  attendanceMatcherCache[
    subjectID
  ] = {

    matcher,
    students

  };


  return attendanceMatcherCache[
    subjectID
  ];
}


/* =========================================================
   START ATTENDANCE CAMERA
========================================================= */

async function startAttendanceCamera() {

  const video =
    $("attendanceVideo");

  if (!video) return;


  if (!selectedSubject) {

    throw new Error(
      "Please select a subject."
    );
  }


  stopAttendanceCamera();


  try {

    await loadFaceModels();


    await getAttendanceFaceMatcher(
      selectedSubject.subjectID
    );


    attendanceCameraStream =
      await navigator.mediaDevices
        .getUserMedia({

          video: {

            width: {
              ideal: 640
            },

            height: {
              ideal: 480
            },

            facingMode:
              "user"
          },

          audio: false
        });


    video.srcObject =
      attendanceCameraStream;


    await new Promise(
      resolve => {

        if (
          video.readyState >= 2
        ) {

          resolve();

          return;
        }


        video.onloadedmetadata =
          () => resolve();

      }
    );


    await video.play();


    setText(
      "attendanceSchedule",
      selectedSubject.schedule || ""
    );


    attendanceScanTimer =
      setInterval(
        recognizeAttendanceFace,
        ATTENDANCE_SCAN_INTERVAL
      );


    setText(
      "attendanceMessage",
      "Camera is ready."
    );


  } catch (error) {

    stopAttendanceCamera();

    throw error;
  }
}


/* =========================================================
   STOP ATTENDANCE CAMERA
========================================================= */

function stopAttendanceCamera() {

  if (
    attendanceScanTimer
  ) {

    clearInterval(
      attendanceScanTimer
    );

    attendanceScanTimer =
      null;
  }


  if (
    attendanceCameraStream
  ) {

    attendanceCameraStream
      .getTracks()
      .forEach(
        track =>
          track.stop()
      );

    attendanceCameraStream =
      null;
  }


  const video =
    $("attendanceVideo");


  if (video) {

    video.srcObject =
      null;
  }


  attendanceRecognitionBusy =
    false;
}


/* =========================================================
   RECOGNIZE FACE
========================================================= */

async function recognizeAttendanceFace() {

  if (
    attendanceRecognitionBusy
  ) {

    return;
  }


  if (
    attendancePopupOpen
  ) {

    return;
  }


  const video =
    $("attendanceVideo");


  if (
    !video ||
    !video.videoWidth ||
    video.readyState < 2
  ) {

    return;
  }


  if (!selectedSubject) {
    return;
  }


  attendanceRecognitionBusy =
    true;


  try {

    const detections =
      await faceapi
        .detectAllFaces(
          video,
          getFaceDetectionOptions()
        )
        .withFaceLandmarks()
        .withFaceDescriptors();


    if (
      detections.length === 0
    ) {

      return;
    }


    if (
      detections.length > 1
    ) {

      showMessage(
        "Only one student should be in front of the camera.",
        "warning",
        "attendanceMessage"
      );

      return;
    }


    const matcherData =
      await getAttendanceFaceMatcher(
        selectedSubject.subjectID
      );


    const match =
      matcherData.matcher.findBestMatch(
        detections[0].descriptor
      );


    if (
      !match ||
      match.label === "unknown"
    ) {

      showMessage(
        "Face not recognized.",
        "warning",
        "attendanceMessage"
      );

      return;
    }


    const student =
      matcherData.students.find(
        item =>
          item.studentID ===
          match.label
      );


    if (!student) {

      showMessage(
        "Recognized student record was not found.",
        "error",
        "attendanceMessage"
      );

      return;
    }


    const now =
      Date.now();


    if (
      lastRecognizedStudentID ===
        student.studentID &&
      now -
        lastRecognitionTime <
        RECOGNITION_COOLDOWN
    ) {

      return;
    }


    lastRecognizedStudentID =
      student.studentID;

    lastRecognitionTime =
      now;


    await saveRecognizedAttendance(
      student
    );


  } catch (error) {

    console.error(
      "Face recognition error:",
      error
    );


    showMessage(
      error.message ||
      "Face recognition failed.",
      "error",
      "attendanceMessage"
    );


  } finally {

    attendanceRecognitionBusy =
      false;
  }
}


/* =========================================================
   SAVE ATTENDANCE
========================================================= */

async function saveRecognizedAttendance(
  student
) {

  if (
    !currentInstructor ||
    !currentInstructor.instructorID
  ) {

    throw new Error(
      "Instructor ID is required."
    );
  }


  if (
    !selectedSubject ||
    !selectedSubject.subjectID
  ) {

    throw new Error(
      "Subject is not selected."
    );
  }


  const date =
    getTodayString();


  const recordKey =
    `${selectedSubject.subjectID}|${date}|${student.studentID}`;


  if (
    attendanceRecordedStudents.has(
      recordKey
    )
  ) {

    return;
  }


  try {

    const result =
      await apiRequest({

        action:
          "markAttendance",

        instructorID:
          currentInstructor.instructorID,

        subjectID:
          selectedSubject.subjectID,

        studentID:
          student.studentID,

        date

      });


    if (
      result.status ===
      "ALREADY_RECORDED"
    ) {

      attendanceRecordedStudents.add(
        recordKey
      );


      showAttendancePopup(
        "Already Recorded",
        `${student.name} already has an attendance record.`,
        "warning"
      );


      return;
    }


    if (
      result.status ===
      "Present"
    ) {

      attendanceRecordedStudents.add(
        recordKey
      );


      showAttendancePopup(
        "Attendance Saved",
        `${student.name} is marked Present.`,
        "success"
      );


      await refreshDashboardAfterAttendance();

      return;
    }


    if (
      result.status ===
      "Late"
    ) {

      attendanceRecordedStudents.add(
        recordKey
      );


      showAttendancePopup(
        "Attendance Saved",
        `${student.name} is marked Late.`,
        "warning"
      );


      await refreshDashboardAfterAttendance();

      return;
    }


    showAttendancePopup(
      "Attendance",
      result.message ||
      "Attendance request completed.",
      "success"
    );


  } catch (error) {

    const message =
      String(
        error.message ||
        ""
      );


    const lower =
      message.toLowerCase();


    if (
      lower.includes("too late")
    ) {

      showAttendancePopup(
        "Too Late",
        "The student is too late. No attendance record was saved.",
        "error"
      );

      return;
    }


    if (
      lower.includes("not scheduled")
    ) {

      showAttendancePopup(
        "Not Scheduled",
        "Attendance is not scheduled today.",
        "error"
      );

      return;
    }


    if (
      lower.includes("not started")
    ) {

      showAttendancePopup(
        "Not Started",
        "Attendance has not started yet.",
        "warning"
      );

      return;
    }


    if (
      lower.includes("already ended")
    ) {

      showAttendancePopup(
        "Class Ended",
        "The class has already ended.",
        "error"
      );

      return;
    }


    showAttendancePopup(
      "Attendance Error",
      message ||
      "Unable to save attendance.",
      "error"
    );
  }
}


/* =========================================================
   REFRESH DASHBOARD
========================================================= */

async function refreshDashboardAfterAttendance() {

  try {

    await loadDashboard();

  } catch (error) {

    console.warn(
      "Dashboard refresh failed:",
      error
    );
  }
}


/* =========================================================
   EDIT ATTENDANCE
========================================================= */

async function editAttendance(
  studentID
) {

  if (
    !selectedDashboardSubjectID
  ) {

    return;
  }


  const status =
    prompt(
      "Enter status: Present, Late, or Absent"
    );


  if (!status) return;


  const normalizedStatus =
    status.trim();


  if (
    ![
      "Present",
      "Late",
      "Absent"
    ].includes(
      normalizedStatus
    )
  ) {

    showMessage(
      "Invalid attendance status.",
      "error",
      "message"
    );

    return;
  }


  const time =
    prompt(
      "Enter time in (example: 08:30)"
    ) || "";


  const date =
    $("dashboardDate")?.value ||
    getTodayString();


  try {

    const result =
      await apiRequest({

        action:
          "updateAttendance",

        instructorID:
          currentInstructor.instructorID,

        subjectID:
          selectedDashboardSubjectID,

        studentID,

        date,

        status:
          normalizedStatus,

        time
      });


    showMessage(
      result.message ||
      "Attendance updated successfully.",
      "success",
      "message"
    );


    await loadDashboard();


  } catch (error) {

    showMessage(
      error.message,
      "error",
      "message"
    );
  }
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value) {

  return String(
    value == null
      ? ""
      : value
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function escapeAttribute(value) {

  return escapeHTML(value);
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEventListeners() {

  /* =======================================================
     LOGIN
  ======================================================= */

  $("loginForm")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();


        const email =
          String(
            $("loginEmail")?.value ||
            ""
          ).trim();


        const password =
          String(
            $("loginPassword")?.value ||
            ""
          );


        if (!email) {

          showMessage(
            "Email is required.",
            "error",
            "message"
          );

          return;
        }


        if (!password) {

          showMessage(
            "Password is required.",
            "error",
            "message"
          );

          return;
        }


        try {

          showMessage(
            "Logging in...",
            "info",
            "message"
          );


          await loginInstructor(
            email,
            password
          );


          $("loginPage")
            ?.classList.add(
              "hidden"
            );


          $("app")
            ?.classList.remove(
              "hidden"
            );


          await loadSubjects();


          const dashboardDate =
            $("dashboardDate");


          if (
            dashboardDate &&
            !dashboardDate.value
          ) {

            dashboardDate.value =
              getTodayString();
          }


          showPage(
            "dashboardPage"
          );


          clearMessage(
            "message"
          );


        } catch (error) {

          showMessage(
            error.message ||
            "Login failed.",
            "error",
            "message"
          );
        }
      }
    );


  /* =======================================================
     INSTRUCTOR REGISTRATION
  ======================================================= */

  $("registerInstructorForm")
    ?.addEventListener(
      "submit",
      registerInstructor
    );


  /* =======================================================
     SHOW REGISTER PAGE
  ======================================================= */

  document
    .querySelectorAll(
      "[data-show-register]"
    )
    .forEach(element => {

      element.addEventListener(
        "click",
        showInstructorRegistration
      );

    });


  /* =======================================================
     SHOW LOGIN PAGE
  ======================================================= */

  document
    .querySelectorAll(
      "[data-show-login]"
    )
    .forEach(element => {

      element.addEventListener(
        "click",
        showLoginPage
      );

    });


  /* =======================================================
     LOGOUT
  ======================================================= */

  document
    .querySelectorAll(
      "[data-logout]"
    )
    .forEach(element => {

      element.addEventListener(
        "click",
        logout
      );

    });


  /* =======================================================
     NAVIGATION
  ======================================================= */

  document
    .querySelectorAll(
      "[data-page]"
    )
    .forEach(element => {

      element.addEventListener(
        "click",
        () => {

          const page =
            element.dataset.page;


          showPage(page);

        }
      );

    });


  /* =======================================================
     SUBJECT FORM
  ======================================================= */

  $("subjectForm")
    ?.addEventListener(
      "submit",
      saveSubject
    );


  /* =======================================================
     STUDENT FORM
  ======================================================= */

  $("studentForm")
    ?.addEventListener(
      "submit",
      registerStudent
    );


  /* =======================================================
     DASHBOARD SUBJECT
  ======================================================= */

  $("dashboardSubject")
    ?.addEventListener(
      "change",
      () => {

        selectedDashboardSubjectID =
          $("dashboardSubject").value;


        loadDashboard();

      }
    );


  /* =======================================================
     DASHBOARD DATE
  ======================================================= */

  $("dashboardDate")
    ?.addEventListener(
      "change",
      loadDashboard
    );


  /* =======================================================
     SUBJECT SEARCH
  ======================================================= */

  $("subjectSearch")
    ?.addEventListener(
      "input",
      filterDashboardSubjects
    );


  /* =======================================================
     STUDENTS SUBJECT
  ======================================================= */

  $("studentsSubject")
    ?.addEventListener(
      "change",
      loadStudentsPage
    );


  /* =======================================================
     ATTENDANCE SUBJECT
  ======================================================= */

  $("attendanceSubject")
    ?.addEventListener(
      "change",
      prepareAttendancePage
    );


  /* =======================================================
     START ATTENDANCE CAMERA
  ======================================================= */

  $("startAttendanceCamera")
    ?.addEventListener(
      "click",
      async () => {

        try {

          await startAttendanceCamera();

        } catch (error) {

          showMessage(
            error.message,
            "error",
            "attendanceMessage"
          );

        }

      }
    );


  /* =======================================================
     STOP ATTENDANCE CAMERA
  ======================================================= */

  $("stopAttendanceCamera")
    ?.addEventListener(
      "click",
      () => {

        stopAttendanceCamera();

        showMessage(
          "Camera stopped.",
          "info",
          "attendanceMessage"
        );

      }
    );


  /* =======================================================
     ATTENDANCE POPUP CLOSE
  ======================================================= */

  $("attendancePopupClose")
    ?.addEventListener(
      "click",
      closeAttendancePopup
    );


  /* =======================================================
     GENERAL POPUP CLOSE
  ======================================================= */

  $("messagePopupClose")
    ?.addEventListener(
      "click",
      closeMessagePopup
    );


  /* =======================================================
     ATTENDANCE POPUP BACKGROUND
  ======================================================= */

  $("attendancePopup")
    ?.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          $("attendancePopup")
        ) {

          closeAttendancePopup();
        }

      }
    );


  /* =======================================================
     MESSAGE POPUP BACKGROUND
  ======================================================= */

  $("messagePopup")
    ?.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          $("messagePopup")
        ) {

          closeMessagePopup();
        }

      }
    );
}


/* =========================================================
   FILTER DASHBOARD SUBJECTS
========================================================= */

function filterDashboardSubjects() {

  const search =
    String(
      $("subjectSearch")?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const select =
    $("dashboardSubject");


  if (!select) return;


  Array.from(
    select.options
  )
    .forEach(option => {

      if (!option.value) {

        option.hidden = false;

        return;
      }


      const subject =
        getSubjectByID(
          option.value
        );


      if (!subject) {

        option.hidden = true;

        return;
      }


      const text =
        `${subject.subjectCode} ${subject.subjectName} ${subject.section} ${subject.program}`
          .toLowerCase();


      option.hidden =
        Boolean(
          search &&
          !text.includes(search)
        );

    });
}


/* =========================================================
   INITIALIZE APP
========================================================= */

async function initializeApp() {

  setupEventListeners();


  const todayInput =
    $("dashboardDate");


  if (
    todayInput &&
    !todayInput.value
  ) {

    todayInput.value =
      getTodayString();
  }


  const loggedIn =
    restoreInstructor();


  if (!loggedIn) {

    $("loginPage")
      ?.classList.remove(
        "hidden"
      );

    $("registerInstructorPage")
      ?.classList.add(
        "hidden"
      );

    $("app")
      ?.classList.add(
        "hidden"
      );

    return;
  }


  $("loginPage")
    ?.classList.add(
      "hidden"
    );


  $("registerInstructorPage")
    ?.classList.add(
      "hidden"
    );


  $("app")
    ?.classList.remove(
      "hidden"
    );


  try {

    await loadSubjects();


    showPage(
      "dashboardPage"
    );


  } catch (error) {

    showMessage(
      error.message,
      "error",
      "message"
    );
  }
}


/* =========================================================
   DOM READY
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeApp
  );

} else {

  initializeApp();

}
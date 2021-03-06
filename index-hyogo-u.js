"use strict";

let workspace = null;
let userInfo = null;
let isHost = false;

// project database for shikkui
const projectId = window.location.search.replace(/\?id=/, "");
let shikkuiDatabase = path => {
  return firebase.database().ref(`/projects/${projectId}/shikkui/${path}`);
};

// firebase auth
const firebaseAuth = new Promise((resolve, reject) => {
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      resolve(user);
    }
    reject("please login");
  });
});

// XML setup
const loadXml = url => {
  return fetch(`/shikkui/${url}`)
    .then(response => response.text())
    .then(data => data)
    .catch(error => console.error(error));
};

const makeWorkspace = htmlToolbox => {
  const htmlBlocklyArea = document.getElementById("blocklyArea");

  workspace = Blockly.inject(htmlBlocklyArea, makeOption(htmlToolbox));

  if (isHost) {
    const htmlBlockXmlCode = localStorage.getItem("blockly-html-code");
    if (htmlBlockXmlCode) {
      workspace.clear();
      const xml = Blockly.Xml.textToDom(htmlBlockXmlCode);
      Blockly.Xml.domToWorkspace(xml, workspace);
    }
  }

  Blockly.svgResize(workspace);

  const updateWorkspace = () => {
    const code = HtmlGenerator.workspaceToCode(workspace);
    document.getElementById("htmlSourcecode").innerText = code;
    document.getElementById(
      "website"
    ).src = `data:text/html;charset=utf-8,${encodeURIComponent(code)}`;

    if (isHost) {
      const xml = Blockly.Xml.workspaceToDom(workspace);
      const xmlText = Blockly.Xml.domToText(xml);
      localStorage.setItem("blockly-html-code", xmlText);

      shikkuiDatabase(`/xml`).set({ xmlCode: xmlText });
    }
  };

  workspace.addChangeListener(updateWorkspace);
};

const makeOption = toolbox => {
  return {
    toolbox: toolbox,
    collapse: true,
    maxBlocks: Infinity,
    trashcan: true,
    tooltips: true,
    css: true,
    media: "https://blockly-demo.appspot.com/static/media/",
    rtl: false,
    scrollbars: true,
    sounds: true,
    oneBasedIndex: true
  };
};

// import Files
const importBlockXml = e => {
  const file = e.files[0];
  if (!file) {
    console.error("file was not found");
    return;
  }
  if (!workspace) {
    console.error("workspace was not found");
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const xmlText = e.target.result;
    if (xmlText) {
      workspace.clear();
      const xml = Blockly.Xml.textToDom(xmlText);
      Blockly.Xml.domToWorkspace(xml, workspace);
    }
  };
  reader.readAsText(file);
};

// export Files
const exportBlockXml = () => {
  if (workspace) {
    const xml = Blockly.Xml.workspaceToDom(workspace);
    const xmlText = Blockly.Xml.domToText(xml);
    const blob = new Blob([xmlText], { type: "text/xml;charset=utf-8" });
    document.getElementById("exportBlockXml").href = window.URL.createObjectURL(
      blob
    );
  } else {
    console.error("cannot export Block XML");
  }
};

const exportHtml = () => {
  if (workspace) {
    const code = HtmlGenerator.workspaceToCode(workspace);
    downloadArchivedPage(code).then(function(response) {
      const blob = new Blob([response], { type: "application/zip" });
      const link = document.createElement("a");
      document.body.appendChild(link);
      link.href = window.URL.createObjectURL(blob);
      link.download = "MyPage.zip";
      link.click();
      document.body.removeChild(link);
    });
  } else {
    console.error("cannot export HTML");
  }
  return false;
};

const downloadArchivedPage = code => {
  return new Promise(function(resolve, reject) {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://kasgai-kura.herokuapp.com");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = "blob";
    xhr.onload = () => {
      resolve(xhr.response);
    };
    xhr.send(JSON.stringify({ html: code }));
  });
};

const firebaseDataAccess = projectId => {
  shikkuiDatabase(`/xml`).on("value", snapshot => {
    if (snapshot.val() != null && !isHost) {
      workspace.clear();
      const xml = Blockly.Xml.textToDom(snapshot.val().xmlCode);
      Blockly.Xml.domToWorkspace(xml, workspace);
    }
  });
};

const loadImageList = projectId =>
  new Promise((resolve, reject) => {
    shikkuiDatabase(`/images`).on("value", snapshot => {
      if (snapshot.val() != null) {
        const imageList = snapshot.val();
        Promise.all(getStrageUrl(projectId, imageList))
          .then(results => {
            return results.map((result, i) => [imageList[i], result]);
          })
          .then(imageOptions => {
            updateSelectImageBlock(imageOptions);
            resolve();
          });
      } else {
        resolve();
      }
    });
  });

const updateSelectImageBlock = imageOptions => {
  if (imageOptions == null || imageOptions.length === 0) {
    return;
  }
  const newSelectImageJson = {
    type: "select_image",
    message0: "image %1",
    args0: [
      {
        type: "field_dropdown",
        name: "NAME",
        options: imageOptions
      }
    ],
    previousStatement: "html",
    nextStatement: "html",
    colour: 90,
    tooltip: "",
    helpUrl: ""
  };
  Blockly.Blocks["select_image"] = {
    init: function() {
      this.jsonInit(newSelectImageJson);
    }
  };
};

const getStrageUrl = (projectId, contentNameList) => {
  return contentNameList.map(name => {
    return new Promise((resolve, reject) => {
      const storageRef = firebase
        .storage()
        .ref(`/shikkui_images/${projectId}/${name}`);

      storageRef
        .getDownloadURL()
        .then(url => resolve(url))
        .catch(error => reject(error));
    });
  });
};

// change isHost
const toggleHost = () => {
  isHost = !isHost;
  const label = isHost ? "master" : "slave";
  document.getElementById("hostButton").innerText = label;
};

// main logic
(async () => {
  // add uploader link
  document.getElementById(
    "uploadImage"
  ).href = `imageuploader.html?id=${projectId}`;

  const requestUrl = "/toolbox-hyogo-u.xml";
  const result = await Promise.all([
    loadXml(requestUrl),
    firebaseAuth,
    loadImageList(projectId)
  ]).catch(error => {
    alert(error);
    return;
  });

  const htmlToolbox = result[0];
  makeWorkspace(htmlToolbox);

  const userInfo = result[1];
  firebaseDataAccess(userInfo);
})();

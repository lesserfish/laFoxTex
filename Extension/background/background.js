    var converterEngine = function (input) { // fn BLOB => Binary => Base64 ?
        
        var uInt8Array = new Uint8Array(input),
            i = uInt8Array.length;
        var biStr = []; //new Array(i);
        while (i--) { biStr[i] = String.fromCharCode(uInt8Array[i]);  }
        var base64 = window.btoa(biStr.join(''));
        return base64;
    };

    var getImageBase64 = function (url, callback) {
        var xhr = new XMLHttpRequest(url), img64;
        xhr.open('GET', url, true); // url is the url of a PNG/JPG image.
        xhr.responseType = 'arraybuffer';
        xhr.callback = callback;
        xhr.onload  = function(){
            img64 = converterEngine(this.response); // convert BLOB to base64
            this.callback(null,img64) // callback : err, data
        };
        xhr.onerror = function(){callback("Error :(", null); };
        xhr.send();
    };

    var getFontSize = function(fontsize){
        var prelogue = (fontsize.length > 0) ? "\\" : "";
        var prologue = (fontsize.length > 0) ? "&space;" : "";
        
        var output = prelogue + fontsize + prologue;
        return output;
    }
    var getDPI = function(fontsize) {
        var prelogue = (fontsize.length > 0) ? "\\dpi{" : "";
        var prologue = (fontsize.length > 0) ? "}" : "";
        var output = prelogue + fontsize + prologue;
        return output;
    }
    var getBackground = function(fontsize) {

        var prelogue = (fontsize.length > 0) ? "\\bg{" : "";
        var prologue = (fontsize.length > 0) ? "}" : "";
        
        var output = prelogue + fontsize + prologue;
        return output;
    }
    var getLatexContent = function(latex){
        latex = latex.replace(/ /g, "&space;")
        return(latex)
    }
function onCreated() {
  if (browser.runtime.lastError) {
    console.log(`Error: ${browser.runtime.lastError}`);
  } else {
    console.log("Item created successfully");
  }
}

browser.menus.create({
  id: "latexify",
  title: "Latexify",
  contexts: ["editable"]
}, onCreated);

browser.menus.onClicked.addListener((info, tab) => {
    if(info.menuItemId === "latexify"){
        console.log(info);
        var selection = info.selectionText;
        var url = "https://latex.codecogs.com/png.image?";
        
        url += getFontSize("");
        url += getDPI("100");
        url += getBackground("");
        url += getLatexContent(selection);

        console.log(url);

        getImageBase64(url, (err, img64) => {
            if(err != null){
                return;
            }
            
            img_src = "data:image/png;base64," + img64;
            browser.tabs.executeScript(tab.id, {
                frameId: info.frameId,
                code: `
                    var element = browser.menus.getTargetElement(${info.targetElementId});
                    console.log(element);
                    element.firstChild.innerText = "";
                    var img = document.createElement('img');
                    img.src = "${img_src}";
                    element.appendChild(img);
                `,
            });
        });
    }
})
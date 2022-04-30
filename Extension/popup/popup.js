document.addEventListener('DOMContentLoaded', () => {
    var scale = document.getElementById('scale-form');
    scale.addEventListener('input', () => {
        var rangeval = document.getElementById('rangeval');
        rangeval.innerText = scale.value;
    })

    var render_button = document.getElementById('render_button');
    render_button.addEventListener('click', () => {
        var outmsg = document.getElementById('output_message')
        var outimg = document.getElementById('output_image');

        outmsg.innerText = ""
        outimg.src = ""

        var scale = document.getElementById('scale-form');
        var scale_value = parseFloat(scale.value) || 1.0;

        var inline = document.getElementById('inline');
        var inline_value = inline.checked;

        var em = document.getElementById('em');
        var em_value = parseInt(em.value) || 16;
        
        var ex = document.getElementById('ex');
        var ex_value = parseInt(ex.value) || 16;

        var texsrc = document.getElementById('texsrc');
        var texsrc_value = texsrc.value;

        reqparams = {
            "texsrc" : String(texsrc_value),
            "em" : String(em_value),
            "ex" : String(ex_value),
            "resize" : String(scale_value),
            "inline" : String(inline_value),
        }

        jsonrequest = JSON.stringify(reqparams);
        console.log(jsonrequest);

        url = "https://lafoxtex.com/create"

        var http = new XMLHttpRequest();
        http.open('POST', url);

        http.setRequestHeader("Content-Type", "application/json")

        http.onload = function(data) {
            if(!data) {
                outmsg.innerText = "Error! Failed to connect to server."
                outimg.src = "";
                return;
            }
            var response = data.srcElement;
            if(response.status != 200) {
                outmsg.innerText = "Error. Received status " + String(response.status) + ": " + response.response;
                outimg.src = "";
                return;
            }
            var obj = null;
            try {
                obj = JSON.parse(response.response)
            } catch(e) {
                outmsg.innerText = "Error. Failed to parse response." 
                outimg.src = "";
                return;
            }
            

            var id = obj.id;
            var imguri = obj.redirection;

            var url = "https://" + imguri;

            outmsg.innerText = "";
            outimg.src = url;

            console.log(url);

        }

        http.send(jsonrequest);
    })

})

window.onload = function(){
}
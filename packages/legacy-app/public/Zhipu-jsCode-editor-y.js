$(document).ready(function () {
  if (parent.urlExampleId > 0) {
    parent.exampleFileId = parent.urlExampleId;
    parent.openExampleFile();
  } else {
    var JPcode_ = localStorage.getItem("JPcode");
    if (JPcode_) {
      parent.editorSetVal(JPcode_);
    } else {
      parent.exampleFileId = 43;
      parent.openExampleFile();
    }
  }
  $("#editor_text").bind("input", function () {
    updateJPcode(true);
  });
});
document.onkeydown = function () {
  return parent.setShortcuts(event);
};
document.onmousedown = parent.hideMenu;
var newContent;
function formatJP() {
  var content = $("#editor_text").val();
  content = content.replace(/\r\n/g, "\n");
  arr = content.split("\n");
  newContent = "";
  for (var i = 0; i < arr.length; i++) {
    var v = arr[i];
    if (v.charAt(0) == "Q") {
      var v = arr[i].replace(/\ /g, "");
      v = v.replace(":", ": ");
      var yinhao = false;
      var zhongkuohao = false;
      var newCode = "";
      var lastNote = "";
      for (x = 0; x < v.length; x++) {
        note = v.charAt(x);
        upNote = v.charAt(x - 1);
        nextNote = v.charAt(x + 1);
        if (note == '"') {
          if (yinhao == false) {
            yinhao = true;
          } else {
            yinhao = false;
          }
        }
        if (yinhao == true) {
          newCode += note;
          continue;
        }
        if (lastNote.indexOf("|") == -1) {
          if (note == "[") {
            if (zhongkuohao == false) {
              zhongkuohao = true;
            }
          } else if (note == "]") {
            zhongkuohao = false;
          }
          if (zhongkuohao == true) {
            newCode += note;
            continue;
          }
        }
        if (
          "0123456789-".indexOf(note) > -1 &&
          upNote != "Q" &&
          upNote != "C" &&
          upNote != " " &&
          upNote != "(" &&
          upNote != "y"
        ) {
          note = " " + note;
        }
        if (note == "(" && upNote != "(") {
          note = " " + note;
        }
        if (note == "|" && upNote != "|" && upNote != ":") {
          note = " " + note;
        }
        if (note == ":" && nextNote == "|") {
          note = " " + note;
        }
        if (note == "{" || note == "}") {
          note = " " + note;
        }
        if (isNote(v.charAt(x))) {
          lastNote = v.charAt(x);
        }
        newCode += note;
      }
      newContent += newCode + "\n";
    } else {
      newContent += v + "\n";
    }
  }
  newContent = newContent.trim() + "\n";
  $("#editor_text").val(newContent);
}
function setColor() {
  var content = $("#editor_text").val();
  content = content.replace(/\&/g, "&amp;");
  content = content.replace(/ /g, "&nbsp;");
  arr = content.split("\n");
  newContent = "";
  for (var i = 0; i < arr.length; i++) {
    var v = arr[i].replace(/(^\s*)|(\s*$)/g, "");
    newContent += onColor(v, v.charAt(0)) + "<br/>";
  }
  content = content + "<br/><br/>";
  $("#editor_div").html(newContent);
}
var upContent = "";
setInterval(function () {
  if (parent.winType > 1) {
    content = $("#editor_text").val();
    if (content != upContent) {
    }
    upContent = content;
  }
}, 500);
var drawInterval;
var keyDrawState = 0;
function updateJPcode(key) {
  if (parent.$("#jpFormat").prop("checked")) {
    textObj = $("#editor_text")[0];
    var startPos = textObj.selectionStart,
      endPos = textObj.selectionEnd,
      tmpStr = textObj.value;
    var cuText = tmpStr.substring(startPos - 1, startPos);
    if ("a0123456789|:".indexOf(cuText) > 0) {
      textObj.value =
        tmpStr.substring(0, startPos) +
        "tuweifu" +
        tmpStr.substring(endPos, tmpStr.length);
      formatJP();
      tmpStr = textObj.value;
      gbPOS_ = tmpStr.indexOf("tuweifu");
      tmpStr = tmpStr.replace(/tuweifu/g, "");
      textObj.value = tmpStr;
      textObj.selectionStart = textObj.selectionEnd = gbPOS_;
    }
  }
  localStorage.setItem("JPcode", $("#editor_text").val());
  setColor();
  cuTime = getHaomiao();
  if (key == true) {
    if (keyDrawState == 0) {
      parent.redraw(GbPageNum, "editor");
      keyDrawState = 1;
    } else {
      clearInterval(drawInterval);
      drawInterval = setTimeout(function () {
        parent.redraw(GbPageNum, "editor");
        keyDrawState = 0;
      }, 500);
    }
  } else {
    parent.redraw(-1, "editor");
  }
}
function getHaomiao() {
  var date = new Date();
  var yy = date.getYear();
  var MM = date.getMonth() + 1;
  var dd = date.getDay();
  var hh = date.getHours();
  var mm = date.getMinutes();
  var ss = date.getSeconds();
  var sss = date.getMilliseconds();
  var result = Date.UTC(yy, MM, dd, hh, mm, ss, sss);
  return result;
}
function setScroll() {
  $("#editor_div")[0].scrollTop = $("#editor_text")[0].scrollTop;
  $("#editor_div")[0].scrollLeft = $("#editor_text")[0].scrollLeft;
}
function onColor(content, type) {
  if (type == "Q") {
    var yinhao = false;
    var zhongkuohao = false;
    var newCode = "";
    var lastNote = "";
    for (i = 0; i < content.length; i++) {
      note = content.charAt(i);
      upNote = content.charAt(i - 1);
      nextNote = content.charAt(i + 1);
      if (note == '"') {
        if (yinhao == false) {
          yinhao = true;
        } else {
          yinhao = false;
        }
      }
      if (yinhao == true) {
        newCode += note;
        continue;
      }
      if (lastNote.indexOf("|") == -1) {
        if (note == "[") {
          if (zhongkuohao == false) {
            zhongkuohao = true;
          }
        } else if (note == "]") {
          zhongkuohao = false;
        }
        if (zhongkuohao == true) {
          newCode += note;
          continue;
        }
      }
      if ("0123456789-".indexOf(note) > -1 && upNote != "Q" && upNote != "C") {
        note = '<span class="num">' + note + "</span>";
      }
      if (note == "|") {
        note = '<span class="xiaojiexian">' + note + "</span>";
      }
      if (note == ":" && (upNote == "|" || nextNote == "|")) {
        note = '<span class="xiaojiexian">' + note + "</span>";
      }
      if (note == "{" || note == "}") {
        note = '<span class="dakuohu">' + note + "</span>";
      }
      if (isNote(content.charAt(i))) {
        lastNote = content.charAt(i);
      }
      newCode += note;
    }
    newCode = newCode.replace(
      /(^[A-Z]:|^[A-Z]+[\d]:|^[Q]+[\d]+[\"]+[^\"]+[\"]|^[Q]+[\d]+[\"]+[\"]:)/g,
      '<span class="hangtou">$1</span>'
    );
    newCode = '<span class="qu">' + newCode + "</span>";
    content = newCode;
  } else {
    content = content.replace(
      /(^[A-Z]:|^[A-Z]+[\d]:|^[Q]+[\d]+[\"]+[^\"]+[\"]|^[Q]+[\d]+[\"]+[\"]:)/g,
      '<span class="hangtou">$1</span>'
    );
  }
  content = content.replace(/^(#.*?$)/g, '<span class="zhushi">$1</span>');
  content = content.replace(/(\[fenye\])/g, '<span class="fenye">$1</span>');
  return content;
}
function editdorKeyup() {
  autoSize();
  getGbInfo();
}
function editdorClick() {
  getGbInfo();
}
function editdorOnblur() {
  hideCursor();
}
function hideCursor() {
  parent.$("#cursor").hide();
  parent.$("text[cipos]").attr("fill", "#101010");
}
function autoSize() {
  var arr = $("#editor_text").val().split("\n");
  var newHeight = 0;
  var newWidth = 0;
  var arrLen = arr.length;
  for (var i = 0; i < arrLen; i++) {
    var strLen = arr[i].replace(/[^\x00-\xff]/gi, "--").length;
    if (strLen > newWidth) {
      newWidth = strLen;
    }
  }
  newHeight = arrLen * 27;
  newWidth = newWidth * 10;
  var pageWidth = $(window).width() - 30;
  var pageHeight = $(window).height() - 20;
  if (newWidth < pageWidth) {
    newWidth = pageWidth;
  }
  if (newHeight < pageHeight) {
    newHeight = pageHeight;
  }
  $("#editor_text").height(newHeight);
  $("#editor_div").height(newHeight);
  $("#editor_text").width(newWidth);
  $("#editor_div").width(newWidth);
}
function editdorKeydown() {
  textObj = $("#editor_text")[0];
  var keyCode = event.keyCode;
  var str;
  if (event.shiftKey && keyCode == 222) {
    if (keyCode == 222) {
      str = '"';
    }
    var startPos = textObj.selectionStart,
      endPos = textObj.selectionEnd,
      cursorPos = startPos,
      tmpStr = textObj.value;
    textObj.value =
      tmpStr.substring(0, startPos) +
      str +
      tmpStr.substring(endPos, tmpStr.length);
    textObj.selectionStart = textObj.selectionEnd = cursorPos;
  }
  if (
    !event.ctrlKey &&
    (keyCode == 81 ||
      keyCode == 67 ||
      keyCode == 90 ||
      keyCode == 66 ||
      keyCode == 68 ||
      keyCode == 80 ||
      keyCode == 74 ||
      keyCode == 86 ||
      keyCode == 72)
  ) {
    if (keyCode == 81) {
      str = "Q";
    }
    if (keyCode == 67) {
      str = "C";
    }
    if (keyCode == 66) {
      str = "B";
    }
    if (keyCode == 90) {
      str = "Z";
    }
    if (keyCode == 68) {
      str = "D";
    }
    if (keyCode == 80) {
      str = "P";
    }
    if (keyCode == 74) {
      str = "J";
    }
    if (keyCode == 86) {
      str = "V";
    }
    if (keyCode == 72) {
      str = "H";
    }
    var startPos = textObj.selectionStart,
      endPos = textObj.selectionEnd,
      cursorPos = startPos,
      tmpStr = textObj.value;
    var upNote = tmpStr.substring(startPos - 1, startPos);
    if (upNote == "\n") {
      textObj.value =
        tmpStr.substring(0, startPos) +
        str +
        ": " +
        tmpStr.substring(endPos, tmpStr.length);
      textObj.selectionStart = textObj.selectionEnd = cursorPos + 3;
      updateJPcode();
      return false;
    }
  }
  return true;
}
function getGbInfo() {
  var act = document.activeElement.id;
  hideCursor();
  var textObj = $("#editor_text")[0];
  var tmpStr = textObj.value;
  var startPos = textObj.selectionStart;
  if (textObj.selectionEnd > textObj.selectionStart) {
    startPos = textObj.selectionEnd;
  }
  var gbInfo = getGbInfo2(tmpStr, startPos);
}
var GbPageNum;
function getGbInfo2(code, startPos) {
  if (!startPos) {
    return false;
  }
  var lineNum = 1;
  var qNum = 0;
  var pageNum = 0;
  var newLine = true;
  var lineStyle, lastLineIndex;
  for (i = 0; i < startPos; i++) {
    note = code.charAt(i);
    if (code.charAt(i) == "\n") {
      lineNum++;
      newLine = true;
      if (code.substring(i + 1, i + 8) == "[fenye]") {
        pageNum++;
        qNum = 0;
      }
    } else {
      if (newLine == true) {
        newLine = false;
        if (note == "Q") {
          qNum++;
        }
        lineStyle = note;
        lastLineIndex = i;
      }
    }
  }
  var notePos = 0;
  var lastNote = "";
  var lianxu = "";
  if (lineStyle == "Q") {
    var maohao = false;
    var huakuokhao = false;
    var yinhao = false;
    var zhongkuohao = false;
    for (i = lastLineIndex; i < startPos; i++) {
      note = code.charAt(i);
      next1 = code.charAt(i + 1);
      if (note == "{") {
        huakuokhao = true;
      } else if (note == "}") {
        huakuokhao = false;
      }
      if (huakuokhao == true) {
        continue;
      }
      if (note == '"') {
        if (yinhao == false) {
          yinhao = true;
        } else {
          yinhao = false;
        }
      }
      if (yinhao == true) {
        continue;
      }
      if (lastNote.indexOf("|") == -1) {
        if (note == "[") {
          if (zhongkuohao == false) {
            zhongkuohao = true;
          }
        } else if (note == "]") {
          zhongkuohao = false;
        }
        if (zhongkuohao == true) {
          continue;
        }
      }
      if (maohao == false && note == ":") {
        maohao = true;
        continue;
      }
      if (maohao == false) {
        continue;
      }
      if (isNote(note)) {
        if (
          (note == "|" && next1 == "|") ||
          (lastNote == "||" && note == "|")
        ) {
          lastNote = "||";
          if (next1 == "|") {
            notePos++;
          }
        } else {
          lastNote = note;
          notePos++;
        }
      }
    }
    var noteObj = parent.$(
      "use[notepos='" + pageNum + "_" + qNum + "_" + notePos + "']"
    );
    if (noteObj.length == 0) {
      parent.$("#cursor").css({ display: "none" });
      return false;
    }
    var topPY = 55 - parent.$(".preview").scrollTop() + 5;
    var leftPY = parent.$("#page_0").offset().left - 18;
    if (lastNote == "|" || lastNote == "||") {
      topPY -= 6;
    }
    var top_ = noteObj.offset().top - topPY - 4;
    var left_ = noteObj.offset().left - leftPY - 4;
    parent
      .$("#cursor")
      .css({ "margin-top": top_, "margin-left": left_, display: "block" });
    var previewObj = parent.$(".preview");
    if (
      previewObj.scrollTop() + previewObj.height() - 55 < top_ + 20 ||
      previewObj.scrollTop() > top_ - 20
    ) {
      previewObj.animate({ scrollTop: top_ - previewObj.height() + 160 }, 100);
    }
    var ciObj = parent.$(
      "text[cipos='" + pageNum + "_" + qNum + "_" + notePos + "']"
    );
    ciObj.attr("fill", "#ff0000");
  }
  GbPageNum = pageNum;
}
function isNote(str) {
  var nList = "0123456789-|";
  if (nList.indexOf(str) > -1) {
    return true;
  }
  return false;
}
function isNoteStart(str) {
  var nList = "0123456789-|:(\n";
  if (nList.indexOf(str) > -1) {
    return true;
  }
  return false;
}
function setPos(str) {
  var code = $("#editor_text").val();
  var lineNum = 1;
  var qNum = 0;
  var newLine = true;
  var lineStyle, lastLineIndex;
  var notePos = 0;
  var lastNote = "";
  var lianxu = "";
  var pageNum = 0;
  for (i = 0; i < code.length; i++) {
    note = code.charAt(i);
    if (code.charAt(i) == "\n") {
      lineNum++;
      newLine = true;
      if (code.substring(i + 1, i + 8) == "[fenye]") {
        pageNum++;
        qNum = 0;
      }
    } else {
      if (newLine == true) {
        newLine = false;
        if (note == "Q") {
          qNum++;
        }
        lineStyle = note;
        lastLineIndex = i;
        var maohao = false;
        var huakuokhao = false;
        var yinhao = false;
        var zhongkuohao = false;
        notePos = 0;
      }
      if (lineStyle == "Q") {
        if (note == "{") {
          huakuokhao = true;
        } else if (note == "}") {
          huakuokhao = false;
        }
        if (huakuokhao == true) {
          continue;
        }
        if (note == '"') {
          if (yinhao == false) {
            yinhao = true;
          } else {
            yinhao = false;
          }
        }
        if (yinhao == true) {
          continue;
        }
        if (lastNote.indexOf("|") == -1) {
          if (note == "[") {
            if (zhongkuohao == false) {
              zhongkuohao = true;
            }
          } else if (note == "]") {
            zhongkuohao = false;
          }
          if (zhongkuohao == true) {
            continue;
          }
        }
        if (maohao == false && note == ":") {
          maohao = true;
          continue;
        }
        if (maohao == false) {
          continue;
        }
        next1 = code.charAt(i + 1);
        if (isNote(note)) {
          if (
            (note == "|" && next1 == "|") ||
            (lastNote == "||" && note == "|")
          ) {
            lastNote = "||";
            if (next1 == "|") {
              notePos++;
            }
            i++;
          } else {
            lastNote = note;
            notePos++;
          }
        }
        if (pageNum + "_" + qNum + "_" + notePos == str) {
          var startPos = i;
          var xiaojieType = "none";
          if (
            note == "|" &&
            code.charAt(i - 1) == "|" &&
            code.charAt(i + 1) == "/"
          ) {
            startPos--;
            xiaojieType = "||/";
          } else if (note == "|" && code.charAt(i - 1) == "|") {
            startPos--;
            xiaojieType = "||";
          } else if (
            note == "|" &&
            code.charAt(i - 1) == ":" &&
            code.charAt(i + 1) == ":"
          ) {
            startPos--;
            xiaojieType = ":|:";
          } else if (note == "|" && code.charAt(i - 1) == ":") {
            startPos--;
            xiaojieType = ":|";
          } else if (note == "|" && code.charAt(i + 1) == ":") {
            xiaojieType = "|:";
          }
          for (x = i + 1; x < code.length; x++) {
            var nList = "(";
            if (nList.indexOf(code.charAt(x)) > -1) {
              i++;
            } else {
              break;
            }
          }
          if (xiaojieType != "none") {
            $("#editor_text")[0].selectionStart = startPos + xiaojieType.length;
            $("#editor_text")[0].selectionEnd = startPos + xiaojieType.length;
          } else {
            var yinhao_ = false;
            var zhongkuohao_ = false;
            for (x = i + 1; x < code.length; x++) {
              var noet_ = code.charAt(x);
              if (noet_ == '"') {
                if (yinhao == false) {
                  yinhao = true;
                } else {
                  yinhao = false;
                }
              }
              if (yinhao == true) {
                continue;
              }
              if (lastNote.indexOf("|") == -1) {
                if (noet_ == "[") {
                  if (zhongkuohao == false) {
                    zhongkuohao = true;
                  }
                } else if (noet_ == "]") {
                  zhongkuohao = false;
                }
                if (zhongkuohao == true) {
                  continue;
                }
              }
              if (isNoteStart(noet_)) {
                if (code.charAt(x - 1) == " ") {
                  x--;
                }
                $("#editor_text")[0].selectionStart = x;
                $("#editor_text")[0].selectionEnd = x;
                break;
              }
            }
          }
          $("#editor_text").focus();
          getGbInfo();
          break;
        }
      }
    }
  }
}

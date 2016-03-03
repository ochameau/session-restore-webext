// Watch for scroll position

window.addEventListener("scroll", function (e) {
  saveScroll(e.pageX, e.pageY); 
});
function saveScroll(x, y) {
  update("scroll", { x, y });
}
function restoreScroll(scroll, n) {
  dump("restore scroll: "+scroll.x+" x "+scroll.y+"\n");
  // Bail out if we don't manage to restore scroll position after a few tries
  if (!n) n=1;
  if (n > 20) return;

  window.scrollTo(scroll.x, scroll.y);

  // Sometimes, if the page is still computing its DOM, scroll didn't work yet
  if (window.scrollX != scroll.x || window.scrollY != scroll.y) {
    setTimeout(restoreScroll, 50, scroll, n++);
  }
}

// /public/js/me.js
async function getMe(){
  try{
    const res = await fetch('/api/me', {credentials:'include'});
    if(!res.ok) return null;
    return await res.json();
  }catch{ return null; }
}
document.addEventListener('DOMContentLoaded', async ()=>{
  const me = await getMe();
  const userBtn = document.getElementById('userBtn');
  const btnLogout = document.getElementById('btnLogout');
  const hostName = document.getElementById('hostName');
  const joinName = document.getElementById('joinName');

  if(me && me.name){
    if(userBtn){ userBtn.textContent = me.name; userBtn.href = '/debate'; }
    if(btnLogout){ btnLogout.style.display = 'inline-block'; }
    if(hostName && !hostName.value){ hostName.value = me.name; }
    if(joinName && !joinName.value){ joinName.value = me.name; }
  }else{
    if(userBtn){ userBtn.textContent = 'Iniciar sesión'; userBtn.href = '/auth'; }
    if(btnLogout){ btnLogout.style.display = 'none'; }
  }
});

// === Visual helpers: blobs parallax & reveal-on-scroll ===
(() => {
  const blobs = document.querySelectorAll('.blob');
  if (blobs.length) {
    document.addEventListener('mousemove', e => {
      const x = (e.clientX / window.innerWidth - .5) * 10;
      const y = (e.clientY / window.innerHeight - .5) * 10;
      blobs.forEach((el, i) => {
        el.style.transform = `translate(${x * (i ? 1.2 : 0.8)}px, ${y * (i ? -1 : 1)}px)`;
      });
    });
  }
  const els = document.querySelectorAll('.reveal');
  if (els.length) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
      }, { threshold: .12 });
      els.forEach(el => io.observe(el));
    } else {
      els.forEach(el => el.classList.add('in'));
    }
  }
})();
// ================================
// ANIMACIÓN "On Scroll"
// ================================
function revealOnScroll(entries, observer) {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("reveal-visible");
      observer.unobserve(entry.target); // para no volver a animar
    }
  });
}

const revealObserver = new IntersectionObserver(revealOnScroll, {
  threshold: 0.18
});

// Selecciona los elementos animables
document.querySelectorAll(".reveal-left, .reveal-right, .reveal-fade")
  .forEach(el => revealObserver.observe(el));
// ===== Carrusel automático para shop-block (requiere jQuery) =====
(function(){
  const $block = $('.shop-block');
  if(!$block.length) return;

  // Estado: empezamos como en tu script (product2 visible)
  let i = 2; // 1..3

  function show(n){
    if(n === i) return;
    const from = i, to = n;
    // Oculta el actual
    $block.find(`.product${from}`).stop(true, true).fadeOut(400);
    // Mueve auriculares
    $block.find(`.h${from}`).stop(true, true).animate({ top: (from===1?'-30%':from===2?'-30%':'130%') }, 400);
    // Muestra el siguiente
    $block.find(`.product${to}`).stop(true, true).fadeIn(400);
    $block.find(`.h${to}`).stop(true, true).animate({ top: '50%' }, 400);
    i = to;
  }

  function next(){
    show(i === 3 ? 1 : i + 1);
  }

  // Intervalo con pausa al pasar el mouse
  let timer = null;
  const start = () => { if(!timer) timer = setInterval(next, 4500); };
  const stop  = () => { clearInterval(timer); timer = null; };

  // Pausa al pasar el mouse sobre todo el bloque
  $block.on('mouseenter', stop).on('mouseleave', start);

  // Pausa cuando NO está en el viewport (ahorra recursos)
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e => e.isIntersecting ? start() : stop());
  }, { threshold: 0.2 });
  io.observe($block.get(0));

  // Asegura estado inicial: solo product2 visible
  $block.find('.product1,.product3').hide();
  $block.find('.h1').css('top','-30%');
  $block.find('.h2').css('top','50%');
  $block.find('.h3').css('top','130%');
})();
let products = document.querySelectorAll(".infoSection > div");
let current = 0;
products[current].classList.add("active");

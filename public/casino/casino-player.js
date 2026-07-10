(function () {
  window.__casinoPlayerProfile__ = null;

  function formatWallet(addr) {
    return addr ? addr.slice(0, 4) + "..." + addr.slice(-4) : "";
  }

  window.updateCasinoPlayerBadge = function (addr) {
    var profile = window.__casinoPlayerProfile__;
    var avatar = document.getElementById("player-avatar");
    var username = document.getElementById("player-username");
    var walletEl = document.getElementById("wallet-address");

    if (walletEl) {
      walletEl.textContent = formatWallet(addr);
      if (addr) walletEl.dataset.fullAddress = addr;
      else delete walletEl.dataset.fullAddress;
    }

    if (!profile) {
      if (avatar) avatar.style.display = "none";
      if (username) username.style.display = "none";
      return;
    }

    if (avatar) {
      if (profile.image) {
        avatar.src = profile.image;
        avatar.alt = profile.name || "Player";
        avatar.style.display = "block";
      } else {
        avatar.style.display = "none";
      }
    }

    if (username) {
      if (profile.name || profile.discordUsername) {
        username.textContent = profile.name || profile.discordUsername;
        username.style.display = "block";
      } else {
        username.style.display = "none";
      }
    }
  };

  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "PLAYER_PROFILE") return;
    window.__casinoPlayerProfile__ = e.data.profile || null;
    var walletEl = document.getElementById("wallet-address");
    var addr = walletEl && walletEl.dataset.fullAddress;
    window.updateCasinoPlayerBadge(addr || null);
  });
})();

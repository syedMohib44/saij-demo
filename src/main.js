import { AvaturnHead } from "@avaturn-live/web-sdk";

async function createSession() {
  const res = await fetch("http://localhost:8001/create-session", {
    method: "POST"
  });

  const data = await res.json();
  return data.session_token;
}

async function loadAvatar() {
  const container = document.getElementById("avatar-container");
  const sessionToken = await createSession();

  const avatar = new AvaturnHead(container, {
    apiHost: "https://api.avaturn.live",
    sessionToken,
    immediatelyJoin: true,
    keepAlive: true,
    audioSource: true,
  });

  await avatar.init();
}

loadAvatar();

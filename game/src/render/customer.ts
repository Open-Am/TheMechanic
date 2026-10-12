// The customer in the scene (plan 0015 step 8, ADRs 0015, 0023 and 0025): a small cache of downloaded people by look,
// the round's person shown at their spot behind the bench, their clips played with one AnimationMixer.
//
// Never picked: the person lives on CUSTOMER_LAYER only, outside the machine's group, so the pointer's ray casts, the
// hover and the hand's collision check (which all look at the machine) never see them. A tap or drag on them is a tap
// or drag on empty space.
// Nothing waits on a file (ADR 0023): a look that is missing, fails or has not arrived plays without a figure, and
// appears in the pose for the current mood if it arrives during the round.

import { AnimationMixer, Group, LoopOnce, LoopRepeat, Vector3, type AnimationAction, type AnimationClip, type Camera, type Object3D, type Scene } from "three";
import { clipFor, customerPlace, moodAfter, type ClipPlan, type CustomerClip, type CustomerEvent, type CustomerMood, type StoryClip } from "./customerpose.ts";

/** The Three.js layer the customer is drawn on: the camera sees it, the ray casts (layer 0) do not. */
export const CUSTOMER_LAYER = 3;
/** Seconds to blend from one clip into the next. */
const FADE = 0.2;

export interface CustomerFile {
  scene: Object3D;
  animations: AnimationClip[];
}

/** Downloads one look's file; null if it is missing or cannot be read. Never rejects. */
export type CustomerLoader = (look: string) => Promise<CustomerFile | null>;

export interface CustomerStage {
  /** Starts downloading a look if it is not already in the cache. */
  request(look: string | null): void;
  /** The round's look: shown now if downloaded, or as soon as it arrives. */
  show(look: string | null): void;
  /** A game event; only the clock and the cord move the customer (ADR 0007). */
  event(e: CustomerEvent): void;
  update(dt: number): void;
  /** For the browser check (development only). */
  info(): CustomerInfo;
  /** True if the round's person is downloaded and in the scene. */
  ready(): boolean;
  /**
   * Plays one of plan 0017's clips once (ADR 0026); `then` as for clipFor. It can be held at a moment (`holdAt`) until
   * release(), and skipped to its end.
   */
  story(clip: StoryClip, then: ClipPlan["then"]): void;
  /** Seconds into the story clip playing, or null if none is. */
  storyTime(): number | null;
  /** Stops the story clip at `t` seconds until release() (plan 0018's engine runs then, ADR 0027). */
  holdAt(t: number | null): void;
  release(): void;
  /** Jumps the story clip to its end. */
  skip(): void;
  /** Jumps the story clip to `t` seconds (plan 0018: a tap skips a step of the engine's run). */
  seek(t: number): void;
  /** World positions of the right and left hands' grip points, or null without a figure. */
  grips(): { right: Vector3; left: Vector3 } | null;
  /** The notes prop in the right hand, or null without a figure: the mechanic's hand takes a copy (plan 0018). */
  notesObject(): Object3D | null;
  /** Shows or hides the notes in the right hand (ADR 0026). */
  setNotes(shown: boolean): void;
  /** The group at the customer's spot (for measuring on screen). */
  readonly root: Group;
}

export interface CustomerInfo {
  look: string | null;
  clip: CustomerClip | null;
  shown: boolean;
  /** Each look ever requested, in order, with the ms (performance.now) it was asked for and how it ended. */
  requests: Array<{ look: string; at: number; state: "loading" | "ready" | "failed" }>;
}

interface Entry {
  state: "loading" | "ready" | "failed";
  file: CustomerFile | null;
  at: number;
}

export function createCustomerStage(scene: Scene, camera: Camera, load: CustomerLoader, now: () => number = () => performance.now()): CustomerStage {
  camera.layers.enable(CUSTOMER_LAYER);
  const root = new Group();
  root.name = "customer_place";
  const place = customerPlace();
  root.position.set(...place.position);
  root.rotation.y = place.rotationY;
  root.layers.set(CUSTOMER_LAYER);
  scene.add(root);

  const cache = new Map<string, Entry>();
  const order: string[] = [];
  let look: string | null = null;
  let attached: string | null = null;
  let mixer: AnimationMixer | null = null;
  let action: AnimationAction | null = null;
  let playing: CustomerClip | null = null;
  let mood: CustomerMood = "calm";
  /** What should be playing now, so a late file starts in the right pose. */
  let plan: ClipPlan = { clip: "idle", then: "loop" };
  let hidden = false;
  let storyClip: StoryClip | null = null;
  let held: number | null = null;

  function request(l: string | null): void {
    if (!l || cache.has(l)) return;
    const entry: Entry = { state: "loading", file: null, at: now() };
    cache.set(l, entry);
    order.push(l);
    void load(l).then(
      (file) => {
        entry.file = file;
        entry.state = file ? "ready" : "failed";
        if (file) prepare(l, file);
        if (l === look) attach();
      },
      () => void (entry.state = "failed"),
    );
  }

  /** Puts a downloaded person on the customer layer, keeps skinned meshes drawn as they walk off, hides the notes. */
  function prepare(l: string, file: CustomerFile): void {
    file.scene.traverse((o) => {
      o.layers.set(CUSTOMER_LAYER);
      o.frustumCulled = false;
      // The notes (ADR 0026) show only while the customer pays.
      if (o.name === `${l}_notes`) o.visible = false;
    });
  }

  function clipNamed(name: CustomerClip): AnimationClip | null {
    const file = attached ? cache.get(attached)?.file : null;
    return file?.animations.find((a) => a.name === `${attached}.${name}`) ?? null;
  }

  /** Plays a clip now: once (then what the plan says) or looping. */
  function play(name: CustomerClip, loop: boolean, fade = FADE): void {
    if (!mixer) return;
    const clip = clipNamed(name);
    if (!clip) return;
    const next = mixer.clipAction(clip);
    next.reset();
    next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.play();
    if (action && action !== next) action.crossFadeTo(next, fade, false);
    action = next;
    playing = name;
  }

  function start(p: ClipPlan, fade = FADE): void {
    plan = p;
    play(p.clip, p.then === "loop", fade);
  }

  function attach(): void {
    if (attached === look) return;
    if (attached) {
      const old = cache.get(attached)?.file;
      if (old) root.remove(old.scene);
      mixer?.stopAllAction();
      mixer = null;
      action = null;
      playing = null;
      attached = null;
    }
    const entry = look ? cache.get(look) : undefined;
    if (!look || !entry?.file) return;
    attached = look;
    root.add(entry.file.scene);
    mixer = new AnimationMixer(entry.file.scene);
    mixer.addEventListener("finished", (e) => {
      if ((e as unknown as { action: AnimationAction }).action !== action) return;
      storyClip = null;
      const then = plan.then;
      if (then === "hide") {
        hidden = true;
        root.visible = false;
      } else if (then !== "hold" && then !== "loop") {
        start({ clip: then, then: "loop" });
      }
    });
    // Arrived late: straight into the pose for how things stand (a held ending stays held; a walk-out stays hidden).
    if (plan.then === "loop" || plan.then === "hold") start(plan, 0);
    else if (plan.then === "hide") root.visible = false;
    else start({ clip: plan.then, then: "loop" }, 0);
  }

  return {
    root,
    request,
    show(l) {
      if (l === look) return;
      // A new round's person stands resting until the round starts; the last round's ending does not carry over.
      look = l;
      mood = "calm";
      plan = { clip: "idle", then: "loop" };
      hidden = false;
      root.visible = true;
      request(l);
      attach();
    },
    event(e) {
      const p = clipFor(e, mood);
      mood = moodAfter(e, mood);
      if (!p) return;
      if (e.type === "started") {
        hidden = false;
        root.visible = true;
        // The round starts as the generator lands, while they are still stepping back: idle follows the arrival.
        if (storyClip === "arrive") {
          plan = { clip: "arrive", then: "idle" };
          return;
        }
      }
      start(p);
    },
    update(dt) {
      if (held !== null && action && storyClip && action.time >= held) {
        action.time = held;
        mixer?.update(0);
        return;
      }
      mixer?.update(dt);
    },
    ready() {
      return attached !== null && attached === look;
    },
    story(clip, then) {
      hidden = false;
      root.visible = true;
      held = null;
      storyClip = clip;
      start({ clip, then }, clip === "arrive" ? 0 : FADE);
      if (playing !== clip) storyClip = null;
    },
    storyTime() {
      return storyClip && action ? action.time : null;
    },
    holdAt(t) {
      held = t;
    },
    release() {
      held = null;
    },
    skip() {
      if (!storyClip || !action) return;
      held = null;
      action.time = action.getClip().duration;
      mixer?.update(0.0001);
    },
    seek(t) {
      if (!storyClip || !action) return;
      action.time = Math.max(0, Math.min(t, action.getClip().duration));
      mixer?.update(0);
    },
    notesObject() {
      return (attached ? cache.get(attached)?.file?.scene.getObjectByName(`${attached}_notes`) : null) ?? null;
    },
    grips() {
      if (!attached || !root.visible) return null;
      const file = cache.get(attached)?.file;
      const r = file?.scene.getObjectByName(`${attached}_grip_r`);
      const l = file?.scene.getObjectByName(`${attached}_grip_l`);
      if (!r || !l) return null;
      root.updateMatrixWorld(true);
      return { right: r.getWorldPosition(new Vector3()), left: l.getWorldPosition(new Vector3()) };
    },
    setNotes(shown) {
      const notes = attached ? cache.get(attached)?.file?.scene.getObjectByName(`${attached}_notes`) : null;
      if (notes) notes.visible = shown;
    },
    info() {
      return {
        look: attached,
        clip: attached ? playing : null,
        shown: attached !== null && !hidden && root.visible,
        requests: order.map((l) => ({ look: l, at: Math.round(cache.get(l)!.at), state: cache.get(l)!.state })),
      };
    },
  };
}

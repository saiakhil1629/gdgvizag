# Gallery photos

Drop DevFest photos in this folder (JPG or WebP, about 1600px wide), then list them in
the `GALLERY` array near the bottom of `../home.js`:

```js
const GALLERY = [
  "photos/auditorium.jpg",
  { src: "photos/code-labs.jpg", title: "Hands-on code labs", tag: "Code labs", line: "DevFest Vizag 2025" },
];
```

A plain path uses the default caption. An object lets you set the title, tag and line.
While the list is empty, the carousel shows branded placeholder slides.

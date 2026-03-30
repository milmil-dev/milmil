const totalPages = 10;
const page = 1;
const delta = 1;
const range = [];
const result = [];
let prev;

for (let i = 1; i <= totalPages; i++) {
  if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
    range.push(i);
  }
}

for (const i of range) {
  if (prev !== undefined) {
    if (i - prev === 2) {
      result.push(prev + 1);
    } else if (i - prev > 2) {
      result.push('ellipsis');
    }
  }
  result.push(i);
  prev = i;
}
console.log(result);

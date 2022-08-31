
import fs from 'fs';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import louvain from 'graphology-communities-louvain';
import {density} from 'graphology-metrics/graph/density.js';

const args = process.argv.slice(2);
const filename = args[0];
const NB_clusterings = (args.length <= 2 ? 200 : parseInt(args[1]));
const NB_FA2_ITERATIONS = (args.length <= 3 ? 100 : parseInt(args[2]));

const mean = (values) => {
  return (values.reduce((sum, current) => sum + current)) / values.length;
};

const variance = (values, average) => {
  if (average == undefined)
    average = mean(values);
  const squareDiffs = values.map((value) => {
    const diff = value - average;
    return diff * diff;
  });
  return mean(squareDiffs);
};

const std_deviation = (values, values_variance) => {
  if (values_variance == undefined)
    values_variance = variance(values);
  return Math.sqrt(values_variance);
};

const data = JSON.parse(fs.readFileSync(args[0]));
const graph = new Graph({multi: true});
graph.import(data);

// Displaying graph's stats
console.log('Number of nodes:', graph.order);
console.log('Number of edges:', graph.size);
console.log('Graph density:', density(graph));

let time0 = Date.now();
// Préspatialize graph
forceAtlas2.assign(graph, {
  iterations: NB_FA2_ITERATIONS,
  settings: forceAtlas2.inferSettings(graph)
});
let time1 = Date.now();
console.log('ForceAtlas2 processed (' + NB_FA2_ITERATIONS + ' iterations) in:', (time1 - time0)/1000 + "s");
time0 = time1;

// Computing Louvain communities
for (let i = 0; i < NB_clusterings ; i++) {
  const louv_attr = "louvain_" + i;
  louvain.assign(graph, {
    nodeCommunityAttribute: louv_attr
  });
  
  graph.forEachNode((node, attrs) => {
    let proximity = 0,
      neighbors = 0;
    graph.forEachNeighbor(node, (neighbor, neighbor_attrs) => {
      neighbors++;
      if (attrs[louv_attr] == neighbor_attrs[louv_attr])
        proximity++;
    });
    const prox_attr = "community_proximity_" + i;
    const new_attrs = {};
    new_attrs[louv_attr] = String(attrs[louv_attr]);
    new_attrs[prox_attr] = neighbors != 0 ? proximity / neighbors : 1;
    graph.mergeNodeAttributes(node, new_attrs);
  });
}
time1 = Date.now();
console.log('Louvain processed (' + NB_clusterings + ' times) in:', (time1 - time0)/1000 + "s");
time0 = time1;

graph.forEachNode((node, attrs) => {
  const values = Object.keys(attrs)
    .filter((x) => /^community_proximity_/.test(x))
    .map((x) => attrs[x]);
  let averag = mean(values),
    varian = variance(values, averag),
    stddev = std_deviation(values, varian);
  graph.mergeNodeAttributes(node, {
    "clusterability_mean": averag,
    "clusterability_variance": varian,
    "clusterability_std_deviation": stddev
  });
  for (let i = 0; i < NB_clusterings ; i++)
    graph.removeNodeAttribute(node, "community_proximity_" + i)
});
time1 = Date.now();
console.log('Louvain statistics processed in:', (time1 - time0)/1000 + "s");
time0 = time1;

fs.writeFileSync(args[0].replace(/\.json/, "_with_louvains.json"), JSON.stringify(graph.export()));

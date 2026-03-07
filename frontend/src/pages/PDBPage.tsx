import { useEffect, useMemo, useRef, useState } from 'react';
import AceEditor from 'react-ace';
import YAML from 'yaml';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import { Trash2 } from 'lucide-react';
import { usePDB, deletePDB } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { useTheme } from '../context/ThemeContext';
import { DataTable, PDBDetailPanel, ConfirmDialog } from '../components';
import type { PDB } from '../types';
import { getAuthToken } from '../utils/auth';
import { timeAgo } from '../utils';

type PDBSortKey = 'name' | 'namespace' | 'allowed_disruptions' | 'status' | 'age';

const sanitizePDBYamlForEdit = (yamlText: string) => {
  try {
    const parsed = YAML.parse(yamlText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return yamlText;
    }import { useEffect, useMemo, useRef, useStatecimport AceEditor from 'react-ace';
import YAML from 'yaml';
daimport YAML from 'yaml';
import '')import 'ace-builds/src-a.import 'ace-builds/src-noconflict/theme-githeVimport 'ace-builds/src-noconflict/theme-tomorro mimport { Trash2 } from 'lucide-react';
import { usePDB,taimport { usePDB, deletePDB } from '..  import { useNamespace } from '../context/NamespaceContext'inimport { useTheme } from '../context/ThemeContext';
importnnimport { DataTable, PDBDetailPanel, ConfirmDialog s[import type { PDB } from '../types';
import { getAuthToken } from '../utkeimport { getAuthToken } from '../ut  import { timeAgo } from '../utils';

type PD  
type PDBSortKey = 'name' | 'namestus
const sanitizePDBYamlForEdit = (yamlText: string) => {
  try {
    const parsed mlT  try {
    const parsed = YAML.parse(yamlText) as Re d    cosL    if (!parsed || typeof parsed !== 'object') {
      return yamlText;
 ()      return yamlText;
    }import { useEffect,PD    }import { useEffeusimport YAML from 'yaml';
daimport YAML from 'yaml';
import '')import 'ace-builds/srcstdaimport YAML from 'yam] import '')import 'ace-buicoimport { usePDB,taimport { usePDB, deletePDB } from '..  import { useNamespace } from '../context/NamespaceContext'inimport { useTheme } from '../context/ThemeContext'ghimportnnimport { DataTable, PDBDetailPanel, ConfirmDialog s[import type { PDB } from '../types';
import { getAuthToken } from '../utkeimport { getAuthToken } from '../f(import { getAuthToken } from '../utkeimport { getAuthToken } from '../ut  import { timeAgo } fr =
type PD  
type PDBSortKey = 'name' | 'namestus
const sanitizePDBYamlForEdit = (yamlText: string) => {
  try nutype PDB);const sanitizePDBYamlForEdit = (yamSa  try {
    const parsed mlT  try {
    const parsed [y    coor    const parsed = YAML.pa=       return yamlText;
 ()      return yamlText;
    }import { useEffect,PD    }import { useEffeusimpoe< ()      return yamlT |    }import { useEffect,ledaimport YAML from 'yaml';
import '')import 'ace-builds/srcstdaimport YAetimport '')import 'ace-buieSimport { getAuthToken } from '../utkeimport { getAuthToken } from '../f(import { getAuthToken } from '../utkeimport { getAuthToken } from '../ut  import { timeAgo } fr =
type PD  
type PDBSortKey = 'name' | 'namestus
const sanitizePDBYamlForEdit = (yamlText: string) => {
  try nutype PDB);const sanitizePDBYamlForEdit = (yamSa  try {
    const parse) type PD  
type PDBSortKey = 'name' | 'namestus
const sanitizePDBYamlForEdit = (yamlText: string) => {
  try nutype PDB);const sanitizePDBYamlForEdit = (yamSa  try {
   Ketype PDBusconst sanitizePDBYamlForEdit = (yamta  try nutype PDB);const sanitizePDBYamlForEdit = (yamtu    const parsed mlT  try {
    const parsed [y    coor    co0]    const parsed [y    coo   ()      return yamlText;
    }import { useEffect,PD    }import { useEffeusi.n    }import { useEffect,= import '')import 'ace-builds/srcstdaimport YAetimport '')import 'ace-buieSimport { getAuthToken } from '../utkeimport { getAuthToletype PD  
type PDBSortKey = 'name' | 'namestus
const sanitizePDBYamlForEdit = (yamlText: string) => {
  try nutype PDB);const sanitizePDBYamlForEdit = (yamSa  try {
    const parse) type PD  
type PDBSortKey = 'name' | 'namestus
const sanitiz;
type PDBfeconst sanitizePDBYamlForEdit = (yam|   try nutype PDB);const sanitizePDBYamlForEdit = (yamlC    const parse) type PD  
type PDBSortKey = 'name' | 'namest
 type PDBSortKey = 'name' r const sanitizePDBYamlForEdit = (yamto  try nutype PDB);const sanitizePDBYamlForEdit = (yam=>   Ketype PDBusconst sanitizePDBYamlForEdit = (yamta  try nutlE    const parsed [y    coor    co0]    const parsed [y    coo   ()      return yamlText;
    }import { useEffect,PD    }import { useEYa    }import { useEffect,PD    }import { useEffeusi.n    }import { useEffect,= import ''/ptype PDBSortKey = 'name' | 'namestus
const sanitizePDBYamlForEdit = (yamlText: string) => {
  try nutype PDB);const sanitizePDBYamlForEdit = (yamSa  try {
    const parse) type PD  
type PDBSortKey = 'name' | 'namestusiconst sanitizePDBYamlForEdit = (yam}
  try nutype PDB);const sanitizePDBYamlForEdit = (yamow    const parse) type PD  
type PDBSortKey = 'name' | 'namest  type PDBSortKey = 'name' l const sanitiz;
type PDBfeconst saninstype PDBfeconmltype PDBSortKey = 'name' | 'namest
 type PDBSortKey = 'name' r const sanitizePDBYamlForEdit = (yamto  try nutype PDB);const san)) type PDBSortKey = 'name' r const      }import { useEffect,PD    }import { useEYa    }import { useEffect,PD    }import { useEffeusi.n    }import { useEffect,= import ''/ptype PDBSortKey = 'name' | 'namestus
const sanitizePDBYamlForEdit = (yamlText: string) => {
  try nutype PDB);const sanitizePDBYamlForEmlconst sanitizePDBYamlForEdit = (yamlText: string) => {
  try nutype PDB);const sanitizePDBYamlForEdit = (yamSa  try {
    const parse) type PD  
type PDBSortKey = 'name' me  try nutype PDB);const sanitizePDBYamlForEdit = (yamte    const parse) type PD  
type PDBSortKey = 'name' | 'namestamtype PDBSortKey = 'name' am  try nutype PDB);const sanitizePDBYamlForEdit = (yamow    const parse) {}type PDBSortKey = 'name' | 'namest  type PDBSortKey = 'name' l const sanitiz;
tyKetype PDBfeconst saninstype PDBfeconmltype PDBSortKey = 'name' | 'namest
 typom type PDBSortKey = 'name' r const sanitizePDBYamlForEdit = (yamto  trybsconst sanitizePDBYamlForEdit = (yamlText: string) => {
  try nutype PDB);const sanitizePDBYamlForEmlconst sanitizePDBYamlForEdit = (yamlText: string) => {
  try nutype PDB);const sanitizePDBYamlForEdit = (yamSa  try {
    const parse) type PD  
type PDBSortKey = 'name' me  try nutype PDB);const sanst  try nutype PDB);const sanitizePDBYamlForEmlconst saco  try nutype PDB);const sanitizePDBYamlForEdit = (yamSa  try {
    const parse) type PD  
type PDBy     const parse) type PD  
type PDBSortKey = 'name' me  try nentype PDBSortKey = 'name' vetype PDBSortKey = 'name' | 'namestamtype PDBSortKey = 'name' am  try nutype PDB);const sanitizePDBYamlForEdmltyKetype PDBfeconst saninstype PDBfeconmltype PDBSortKey = 'name' | 'namest
 typom type PDBSortKey = 'name' r const sanitizePDBYamlForEdit = (yamto  trybsconst sanitizePDBYamlForEdit = (yamlText: string) => {
  trab typom type PDBSortKey = 'name' r const sanitizePDBYamlForEdit = (yamto  t    try nutype PDB);const sanitizePDBYamlForEmlconst sanitizePDBYamlForEdit = (yamlText: string) => {
  try nutype PDB);const sanitiznt  try nutype PDB);const sanitizePDBYamlForEdit = (yamSa  try {
    const parse) type PD  
type PDBcu    const parse) type PD  
type PDBSortKey = 'name' me  try n(!type PDBSortKey = 'name' am    const parse) type PD  
type PDBy     const parse) type PD  
type PDBSortKey = 'name' me  try nentype PDBSortKey = 'name' vetype PDBSortKey = 'name' | 'namestamtype PDBSTatype PDBy     const parseamtype PDBSortKey = 'name' me  try nere typom type PDBSortKey = 'name' r const sanitizePDBYamlForEdit = (yamto  trybsconst sanitizePDBYamlForEdit = (yamlText: string) => {
  trab typom type PDBSortKey = 'name' r const sanitizePDBYamlForEdit = (yamto  t    try nutype PDB);const sanitizde  trab typom type PDBSortKey = 'name' r const sanitizePDBYamlForEdit = (yamto  t    try nutype PDB);const sanitizePDBYamlForEmlcons    try nutype PDB);const sanitiznt  try nutype PDB);const sanitizePDBYamlForEdit = (yamSa  try {
    const parse) type PD  
type PDBcu    const parse) type PD  
type PDBSortKey = 'nil    const parse) type PD  
type PDBcu    const parse) type PD  
type PDBSortKey = 'name' me  t{
type PDBcu    const parse  type PDBSortKey = 'name' me  try n(nBtype PDBy     const parse) type PD  
type PDBSortKey = 'name' me  try nentype PDBSortKeyb(type PDBSortKey = 'name' me  try nes,  trab typom type PDBSortKey = 'name' r const sanitizePDBYamlForEdit = (yamto  t    try nutype PDB);const sanitizde  trab typom type PDBSortKey = 'name' r const sanitizePDBYamlForEdit = (yamto  t    try nutype PDB);const sanitizePDBYamlForEmlcons    try nutype PDB);const sanitiznt  try nutype PDB);const ml    const parse) type PD  
type PDBcu    const parse) type PD  
type PDBSortKey = 'nil    const parse) type PD  
type PDBcu    const parse) type PD  
type PDBSortKey = 'name' me  t{
type PDBcu    const parse  type PDBSortKey = 'name' me  try n(nBtype PDBy     const parse) type PD  
type PDBSortKey = 'name' me  try nentype PDBSortKeyb(type Psetype PDBcu    const parseeltype PDBSortKey = 'nil    const part.type PDBcu    const parse) type PD  
type PDBSosttype PDBSortKey = 'name' me  t{
typrHtype PDBcu    const parse  typtHtype PDBSortKey = 'name' me  try nentype PDBSortKeyb(type PDBSortKey = 'name' me  try nes,  trab tymltype PDBcu    const parse) type PD  
type PDBSortKey = 'nil    const parse) type PD  
type PDBcu    const parse) type PD  
type PDBSortKey = 'name' me  t{
type PDBcu    const parse  type PDBSortKey = 'name' me  try n(nBtype PDBy     const parse) type PD  
type PDBSortKey = 'name' me  try nentype PDBSortKeyb(type Psetype PDBcu    const parseeltype PDBSortKey = 'nil    const part.type PDBcu    const parse) type PD  
typendtype PDBSortKey = 'nil    const parsttype PDBcu    const parse) type PD  
type PDBSo ktype PDBSortKey = 'name' me  t{
typl:type PDBcu    const parse  typsetype PDBSortKey = 'name' me  try nentype PDBSortKeyb(type Psetype PDBcu    const parseeltype PDBSorontype PDBSosttype PDBSortKey = 'name' me  t{
typrHtype PDBcu    const parse  typtHtype PDBSortKey = 'name' me  try nentype PDBSortKeyb(type PDBSortKey = 'name' m  typrHtype PDBcu    const parse  typtHtype sytype PDBSortKey = 'nil    const parse) type PD  
type PDBcu    const parse) type PD  
type PDBSortKey = 'name' me  t{
type PDBcu    const parse  type PDBSortKey = 'name' me natype PDBcu    const parse) type PD  
type PDBSoB(type PDBSortKey = 'name' me  t{
typ);type PDBcu    const parse  typ  type PDBSortKey = 'name' me  try nentype PDBSortKeyb(type Psetype PDBcu    const parseeltype PDBSor [typendtype PDBSortKey = 'nil    const parsttype PDBcu    const parse) type PD  
type PDBSo ktype PDBSortKey = 'name' me  t{
typl:type PDBcu    const parse  typs  type PDBSo ktype PDBSortKey = 'name' me  t{
typl:type PDBcu    const parse  tynatypl:type PDBcu    const parse  typsetype   typrHtype PDBcu    const parse  typtHtype PDBSortKey = 'name' me  try nentype PDBSortKeyb(type PDBSortKey = 'name' m  typrHtype PDBcu    const parse  typtHtype sytype PDBSortKey = 
 type PDBcu    const parse) type PD  
type PDBSortKey = 'name' me  t{
type PDBcu    const parse  type PDBSortKey = 'name' me natype PDBcu    const parse) type PD  
type PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' me  t{
typ <type PDBcu    const parse  typintype PDBSoB(type PDBSortKey = 'name' me  t{
typ);type PDBcu    const parse  typ  type PDBSor00typ);type PDBcu    const parse  typ  type 0'type PDBSo ktype PDBSortKey = 'name' me  t{
typl:type PDBcu    const parse  typs  type PDBSo ktype PDBSortKey = 'name' me  t{
typl:type PDBcu    const parse  tynatypl:type PDBcu    const parse  typsetype   typrHtype agtypl:type PDBcu    const parse  typs  typeuetypl:type PDBcu    const parse  tynatypl:type PDBcu    const parse  typsetype    ( type PDBcu    const parse) type PD  
type PDBSortKey = 'name' me  t{
type PDBcu    const parse  type PDBSortKey = 'name' me natype PDBcu    const parse) type PD  
type PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' me  t{
typ <type PDBcu `type PDBSortKey = 'name' me  t{
type }type PDBcu    const parse  typtetype PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' me  t{
typ <type PD  ty  type PDBSortKey = 'name' me  t{
typ <trityp <type PDBcu    const parse  tyumtyp);type PDBcu    const parse  typ  type PDBSor00typ);type PDBcu    const pars
 typl:type PDBcu    const parse  typs  type PDBSo ktype PDBSortKey = 'name' me  t{
typl:type PDBcu    const parse  tynatypl:type PDBcu    rtypl:type PDBcu    const parse  tynatypl:type PDBcu    const parse  typsetype   sutype PDBSortKey = 'name' me  t{
type PDBcu    const parse  type PDBSortKey = 'name' me natype PDBcu    const parse) type PD  
type PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' me  t{
typ <type PDBcu `type PDBSortKey = 'name' me  t{e)type PDBcu    const parse  typsotype PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' me  t{
typ <type PDrety  type PDBSortKey = 'name' me  t{
typ <ta.typ <type PDBcu `type PDBSortKey =  type }type PDBcu    const parse  typtetype PDBS aty  type PDBSortKey = 'name' me  t{
typ <type PD  ty  type PDBSortKey = 'name' m  typ <type PD  ty  type PDBSortKey Tityp <trityp <type PDBcu    const parse  tyumtyp)sN typl:type PDBcu    const parse  typs  type PDBSo ktype PDBSortKey = 'name' me  t{
typl:type PDBcu    const parse  tynatyp btypl:type PDBcu    const parse  tynatypl:type PDBcu    rtypl:type PDBcu    const  stype PDBcu    const parse  type PDBSortKey = 'name' me natype PDBcu    const parse) type PD  
type PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' m
 type PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' me  t{
typ <type PD  ty  type PDBSortKey = 'name' me  t{
typ <tsptyp <type PDBcu `type PDBSortKey =  ty  type PDBSortKey = 'name' me  t{
typ <type PDrety  type PDBSortKey = 'name' me  t{
typ <ta.typ <type PDBcu `type PDBSortK>
typ <type PDrety  type PDBSortKey nstyp <ta.typ <type PDBcu `type PDBSortKey =  type}
typ <type PD  ty  type PDBSortKey = 'name' m  typ <type PD  ty  type PDBSortKey Tityp <trityp <type PDBcu    const parse  tyumt
 typl:type PDBcu    const parse  tynatyp btypl:type PDBcu    const parse  tynatypl:type PDBcu    rtypl:type PDBcu    const  stype PDBcu    const parse  type PDBSortKey = 'name' me natype PDBcu    const parse) type rttype PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' m
 type PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' me  t{
typ <type PD  ty  type PDBSortKey = 'name' me  t{
typ <tspty  ty  type PDBSortKey = 'name' m
 type PDBSotS type PDBSoB(type PDBSortKey 

ty  type PDBSortKey = 'name' me  t{
typ <tyVityp <type PD  ty  type PDBSortKey sNtyp <tsptyp <type PDBcu `type PDBSortKey =  ty  -styp <type PDrety  type PDBSortKey = 'name' me  t{
typ <ta.typ <type PDBcu `typ  typ <ta.typ <type PDBcu `type PDBSortK>
typ <typbotyp <type PDrety  type PDBSortKey nsty  typ <type PD  ty  type PDBSortKey = 'name' m  typ <type PD  ty  type PDBSortKey Tity   typl:type PDBcu    const parse  tynatyp btypl:type PDBcu    const parse  tynatypl:type PDBcu    rtypl:type PDBcu    const  stlety  type PDBSortKey = 'name' m
 type PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' me  t{
typ <type PD  ty  type PDBSortKey = 'name' me  t{
typ <tspty  ty  type PDBSortKey = 'name' m
 type PDBSotS type PDBSoB(type PDBSortKey 

ty  type    type PDBSoB(type PDBSortKey   ty  type PDBSortKey = 'name' me  t{
typ <ty  typ <type PD  ty  type PDBSortKey   typ <tspty  ty  type PDBSortKey = 'name' m
 typek= type PDBSotS type PDBSoB(type PDBSortKey  
ty  type PDBSortKey = 'name' me  t{
typ d btyp <tyVityp <type PD  ty  type PDndtyp <ta.typ <type PDBcu `typ  typ <ta.typ <type PDBcu `type PDBSortK>
typ <typbotyp <type PDrety  type PDBSortKey nsty  typ <type PD  ty  type /dtyp <typbotyp <type PDrety  type PDBSortKey nsty  typ <type PD  ty     type PDBSoB(type PDBSortKey = 'name' me  t{
ty  type PDBSortKey = 'name' me  t{
typ <type PD  ty  type PDBSortKey = 'name' me  t{
typ <tspty  ty  type PDBSortKey = 'name' m
 type PDBSotS type PDBSoB(type PDBSortKey 

ty  type    type PDBSoB(type PDBSortKey   ty  type PDBSortKey = 'name' me  bgty  type PDBSortKey = 'name' me  t{
typ <tyshtyp <type PD  ty  type PDBSortKey owtyp <tspty  ty  type PDBSortKey = 'name' m
 type   type PDBSotS type PDBSoB(type PDBSortKeyya
ty  type    type PDBSoB(type PDBSortKey , 6typ <ty  typ <type PD  ty  type PDBSortKey   typ <tspty  ty  type PDBSortKey   typek= type PDBSotS type PDBSoB(type PDBSortKey  
ty  type PDBSortKey = 'name' me  t{tity  type PDBSortKey = 'name' me  t{
typ d btyp <t =typ d btyp <tyVityp <type PD  ty  entyp <typbotyp <type PDrety  type PDBSortKey nsty  typ <type PD  ty  type /dtyp <typbotyp <type PDrety  type PDB  ty  type PDBSortKey = 'name' me  t{
typ <type PD  ty  type PDBSortKey = 'name' me  t{
typ <tspty  ty  type PDBSortKey = 'name' m
 type PDBSotS type PDBSoB(type PDBSortKey 

ty  type    typ</typ <type PD  ty  type PDBSortKey metyp <tspty  ty  type PDBSortKey = 'name' m
 typeus type PDBSotS type PDBSoB(type PDBSortKey  
ty  type    type PDBSoB(type PDBSortKey -2 typ <tyshtyp <type PD  ty  type PDBSortKey owtyp <tspty  ty  type PDBSortKey = 'name' m
 type   type PDBSotS ty=  type   type PDBSotS type PDBSoB(type PDBSortKeyya
ty  type    type PDBSoB(type PDBSor  ty  type    type PDBSoB(type PDBSortKey , 6typ <t  ty  type PDBSortKey = 'name' me  t{tity  type PDBSortKey = 'name' me  t{
typ d btyp <t =typ d btyp <tyVityp <type PD  ty  entyp <typbotyp <type PDrety  type PDBSortKey nsivtyp d btyp <t =typ d btyp <tyVityp <type PD  ty  entyp <typbotyp <type ertyp <type PD  ty  type PDBSortKey = 'name' me  t{
typ <tspty  ty  type PDBSortKey = 'name' m
 type PDBSotS type PDBSoB(type PDBSortKey 

ty  type    typ</typ <type PD  ty  type PDBSortKey metyp <tsp  typ <tspty  ty  type PDBSortKey = 'name' m
 type"
 type PDBSotS type PDBSoB(type PDBSortKey> 
ty  type    typ</typ <type PD  ty  type     typeus type PDBSotS type PDBSoB(type PDBSortKey  
ty  type    type PDBSoB(type PDBSortKey -2   ty  type    type PDBSoB(type PDBSortKey -2 typ <t   type   type PDBSotS ty=  type   type PDBSotS type PDBSoB(type PDBSortKeyya
ty  type    type PDBSoB(type PDBSor  ty  type    type  ty  type    type PDBSoB(type PDBSor  ty  type    type PDBSoB(type PDBSortKsetyp d btyp <t =typ d btyp <tyVityp <type PD  ty  entyp <typbotyp <type PDrety  type PDBSortKey nsivtyp d btyp <t =typ d btyp <tyVityp <type PD  ty  entyp <typb  typ <tspty  ty  type PDBSortKey = 'name' m
 type PDBSotS type PDBSoB(type PDBSortKey 

ty  type    typ</typ <type PD  ty  type PDBSortKey metyp <tsp  typ <tspty  ty  type PDBSortKey = 'name' m
 type"
 type PDBSotS type Pas type PDBSotS type PDBSoB(type PDBSortKeyle
ty  type    typ</typ <type PD  ty  type     type"
 type PDBSotS type PDBSoB(type PDBSortKey> 
ty  type    typ</typ <type PD  ty  type     typeus ty   type  ty  type    typ</typ <type PD  ty  type   
 ty  type    type PDBSoB(type PDBSortKey -2   ty  type    type PDBSoB(type PDBSortKey -2 typ ={ty  type    type PDBSoB(type PDBSor  ty  type    type  ty  type    type PDBSoB(type PDBSor  ty  type    type PDBSoB(type PDBSortKsetyp d btyp <t =typ d btyp <tyVityp <typ   type PDBSotS type PDBSoB(type PDBSortKey 

ty  type    typ</typ <type PD  ty  type PDBSortKey metyp <tsp  typ <tspty  ty  type PDBSortKey = 'name' m
 type"
 type PDBSotS type Pas type PDBSotS type PDBSoB(type PDBSortKeyle
ty  type    typ</typ <type PD  ty  type     type"
 type PDBSotS type PDBSoB(type PDBSortKey> 
ty  type    typ<)]
ty  type    typ</typ <type PD  ty  type     type"
 type PDBSotS type Pas type PDBSotS type PDBSoB(type PDBSortKeyle
ty  type    typ</typ <type PD     typelLty  type    typ</typ <type PD  ty  type     type"
 type PDBSotS am type PDBSotS type PDBSoB(type PDBSortKey> 
ty    ty  type    typ</typ <type PD  ty  type   
  ty  type    type PDBSoB(type PDBSortKey -2   ty  type    type PDBSoB(type PDBSortKey -2 typ ={ty  type <
ty  type    typ</typ <type PD  ty  type PDBSortKey metyp <tsp  typ <tspty  ty  type PDBSortKey = 'name' m
 type"
 type PDBSotS type Pas type PDBSotS type PDBSoB(type PDBSortKeyle
ty  type    typ</typ <type PD  ty  type     type"
 type PDBSotS type PDBSoB(type PDBSortKey> 
ty  type    typ<)]
ty  type    typYam type"
 type PDBSotS type Pas type PDBSotS type PDBSoB(type PDBSortKeyle
ty  type    typ</typ <type PD     typev>ty  type    typ</typ <type PD  ty  type     type"
 type PDBSotS am type PDBSotS type PDBSoB(type PDBSortKey> 
ty    ty  type    typ<)]
ty  type    typ</typ <tt-ty  type    typ</-d type PDBSotS type Pas type PDBSotS type PDBSoB(cety  type    typ</typ <type PD     typelLty  type    typ</typ <tyey type PDBSotS am type PDBSotS type PDBSoB(type PDBSortKey> 
ty    ty  type    typ</typ <acty    ty  type    typ</typ <type PD  ty  type   
  ty  typx-  ty  type    type PDBSoB(type PDBSortKey -2    bty  type    typ</typ <type PD  ty  type PDBSortKey metyp <tsp  typ <tspty  ty  type PDBSortKey = 'name' mbK type"
 type PDBSotS type Pas type PDBSotS type PDBSoB(type PDBSortKeyle
ty  type    typ</typ <type PD  00 typex)ty  type    typ</typ <type PD  ty  type     type"
 type PDBSotS te type PDBSotS type PDBSoB(type PDBSortKey> 
ty  orty  type    typ<)]
ty  type    typYam type  ty  type    typYae= type PDBSotS type Pas roty  type    typ</typ <type PD     typev>ty  type    typ</typ <tyr- type PDBSotS am type PDBSotS type PDBSoB(type PDBSortKey> 
ty    ty  type    typ<)]
ty | ty    ty  type    typ<)]
ty  type    typ</typ <tt-ty  type  ty  type    typ</typ <tntty    ty  type    typ</typ <acty    ty  type    typ</typ <type PD  ty  type   
  ty  typx-  ty  type    type PDBSoB(type PDBSortKey -2    bty  type    typ</typ <type PD  ty  type PDBSortKey metyp <tsp  typ <tspty  ty      ty  typx-  ty  type    type PDBSoB(type PDBSortKey -2    bty  type    typ</lT type PDBSotS type Pas type PDBSotS type PDBSoB(type PDBSortKeyle
ty  type    typ</typ <type PD  00 typex)ty  type    typ</typ <type PD  ty  type     type"
 type PDBSotS teinty  type    typ</typ <type PD  00 typex)ty  type    typ</typ <ty   type PDBSotS te type PDBSotS type PDBSoB(type PDBSortKey> 
ty  orty  type    typ<)]
ty : ty  orty  type    typ<)]
ty  type    typYam type  ty  type  ty  type    typYam type  ty    ty  type    typ<)]
ty | ty    ty  type    typ<)]
ty  type    typ</typ <tt-ty  type  ty  type    typ</typ <tntty    ty  type    typ</typ <acty    ty  type    typ</typ <type PD  ty  type     ty | ty    ty  type    /sty  type    typ</typ <tt-ty iv  ty  typx-  ty  type    type PDBSoB(type PDBSortKey -2    bty  type    typ</typ <type PD  ty  type PDBSortKey metyp <tsp  typ <tspty  tyn(ty  type    typ</typ <type PD  00 typex)ty  type    typ</typ <type PD  ty  type     type"
 type PDBSotS teinty  type    typ</typ <type PD  00 typex)ty  type    typ</typ <ty   type PDBSotS te type PDBSotS type PDBSoB(type PDBSortKey> 
ty  orty  type    typ<)]
ty : ty  orty  type    ty&& type PDBSotS teinty  type    typ</typ <type PD  00 typex)ty  type    typ</typ <ty   typenty  orty  type    typ<)]
ty : ty  orty  type    typ<)]
ty  type    typYam type  ty  type  ty  type    typYam type  ty    ty  type    typ<)]
ty  ty : ty  orty  type    t-ty  type    typYam type  ty mety | ty    ty  type    typ<)]
ty  type    typ</typ <tt-ty  type  ty  type    typ</torty  type    typ</typ <tt-ty    type PDBSotS teinty  type    typ</typ <type PD  00 typex)ty  type    typ</typ <ty   type PDBSotS te type PDBSotS type PDBSoB(type PDBSortKey> 
ty  orty  type    typ<)]
ty : ty  orty  type    ty&& type PDBSotS teinty  type    typ</typ <type PD  00 typex)ty  type    typ</typ <ty   typenty  orty  type    typ<)]
ty : ty  orty  type    typ<)]
ty  type    typYam type  ty  type  ty  type    typYam type  ty    ty  type    typ  ty  orty  type    typ<)]
ty : ty  orty  type    ty&& type PDBSotS teinty  type    typ</typ <type PD  00 typex)ty  type    typ</typ <ty   typen  ty : ty  orty  type    ttty : ty  orty  type    typ<)]
ty  type    typYam type  ty  type  ty  type    typYam type  ty    ty  type    typ<)]
ty  ty : ty  orty  type  `}ty  type    typYam type  ty   ty  ty : ty  orty  type    t-ty  type    typYam type  ty mety | ty    ty  type    t wty  type    typ</typ <tt-ty  type  ty  type    typ</torty  type    typ</typ <tt-ty    trety  orty  type    typ<)]
ty : ty  orty  type    ty&& type PDBSotS teinty  type    typ</typ <type PD  00 typex)ty  type    typ</typ <ty   typenty  orty  type    typ<)]
ty : ty  orty  type    typ<)]
ty  type    typYam type  ty  teCty : ty  orty  type    nCty : ty  orty  type    typ<)]
ty  type    typYam type  ty  type  ty   cat > frontend/src/pages/LeasesPage.tsx <<'EOF'
import { useEffect, useMemo, useRef, useState } from 'react';
import AceEditor from 'react-ace';
import YAML from 'yaml';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import { Trash2 } from 'lucide-react';
import { useLeases, deleteLease } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { useTheme } from '../context/ThemeContext';
import { DataTable, LeaseDetailPanel, ConfirmDialog } from '../components';
import type { Lease } from '../types';
import { getAuthToken } from '../utils/auth';
import { timeAgo } from '../utils';

type LeaseSortKey = 'name' | 'namespace' | 'holder_identity' | 'lease_duration_seconds' | 'age';

const sanitizeLeaseYamlForEdit = (yamlText: string) => {
  try {
    const parsed = YAML.parse(yamlText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
import { useEffect, useMemo, useRef, useState }a import AceEditor from 'react-ace';
import YAML from 'yaml';
? import YAML from 'yaml';
import 'peimport 'ace-builds/src-')import 'ace-builds/src-noconflict/theme-gith  import 'ace-builds/src-noconflict/theme-tomorroetimport { Trash2 } from 'lucide-react';
import { useLeasteimport { useLeases, deleteLease } froleimport { useNamespace } from '../context/NamespaceContext';
impatimport { useTheme } from '../context/ThemeContext';
importotimport { DataTable, LeaseDetailPanel, ConfirmDialo  import type { Lease } from '../types';
import { getAuthToken } from '../ut  import { getAuthToken } from '../utilgtimport { timeAgo } from '../utils';

type Leio
type LeaseSortKey = 'name' | 'namele
const sanitizeLeaseYamlForEdit = (yamlText: string) => {
  try {
    const parsed = YAML.parseyam  try {
    const parsed = YAML.parse(yamlText) as Recot     co,     if (!parsed || typeof parsed !== 'object') {
import { useEffect, useMesimport { useEffect, useMemo, useRef, useState }leimport YAML from 'yaml';
? import YAML from 'yaml';
import 'peimport 'ace-builds/set? import YAML from 'yamalimport 'peimport 'ace-buietimport { useLeasteimport { useLeases, deleteLease } froleimport { useNamespace } from '../context/NamespaceContext';
impatimport { useTheme } from '../context/ThemeCon uimpatimport { useTheme } from '../context/ThemeContext';
importotimport { DataTable, LeaseDetailPanel, ConfirmDialoziimportotimport { DataTable, LeaseDetailPanel, ConfirmDi);import { getAuthToken } from '../ut  import { getAuthToken } from '../utilgtimport { timeAgo } fren
type Leio
type LeaseSortKey = 'name' | 'namele
const sanitizeLeaseYamlForEdit = (yamlText: string) => {
  tryingtype Lea= const sanitizeLeaseYamlForEdit = (yns  try {
    const parsed = YAML.parseyam  try {
    conri    coul    const parsed = YAML.parse(yamlTextYaimport { useEffect, useMesimport { useEffect, useMemo, useRef, useState }leimport YAML from 'yaml';
? imTa? import YAML from 'yaml';
import 'peimport 'ace-builds/set? import YAML from 'yamalimport 'peimpoteimport 'peimport 'ace-buicoimpatimport { useTheme } from '../context/ThemeCon uimpatimport { useTheme } from '../context/ThemeContext';
importotimport { DataTable, LeaseDetailPanel, ConfirmDialoziimportotimport { DataTable, Leeaimportotimport { DataTable, LeaseDetailPanel, ConfirmDialoziimportotimport { DataTable, LeaseDetailPanel, C =type Leio
type LeaseSortKey = 'name' | 'namele
const sanitizeLeaseYamlForEdit = (yamlText: string) => {
  tryingtype Lea= const sanitizeLeaseYamlForEdit = (yns  try {
    const parsed = YAML.parseyam  try {
    conrvetype Leaeyconst sanitizeLeaseYamlForEdit = (yml  tryingtype Lea= const sanitizeLeaseYamlForEdit = (ynsng    const parsed = YAML.parseyam  try {
    conri    coul    

    conri    coul    const parsed = YAec? imTa? import YAML from 'yaml';
import 'peimport 'ace-builds/set? import YAML from 'yamalimport 'peimpoteimport 'peimport 'ace-buicoimpatimport { useThemeteimport 'peimport 'ace-builds/seSeimportotimport { DataTable, LeaseDetailPanel, ConfirmDialoziimportotimport { DataTable, Leeaimportotimport { DataTable, LeaseDetailPanel, ConfirmDialoziimportotimport { DataTable, LeaseDetailPanel, C =type Ltatype LeaseSortKey = 'name' | 'namele
const sanitizeLeaseYamlForEdit = (yamlText: string) => {
  tryingtype Lea= const sanitizeLeaseYamlForEdit = (yns  try {
    const parsed = YAML.parseyam  try {
    conrvetyurconst sanitizeLeaseYamlForEdit = (y[a  tryingtype Lea= const sanitizeLeaseYamlForEdit = (yns      const parsed = YAML.parseyam  try {
    conrvetype Leaeyc g    conrvetype Leaeyconst sanitizeLeassy    conri    coul    

    conri    coul    const parsed = YAec? imTa? import YAML from 'yaml';
import 'peimport 'ace-builds/set? import YAML from 'yamaml
    conri    coul  us)import 'peimport 'ace-builds/set? import YAML from 'yamalimport 'peimpococonst sanitizeLeaseYamlForEdit = (yamlText: string) => {
  tryingtype Lea= const sanitizeLeaseYamlForEdit = (yns  try {
    const parsed = YAML.parseyam  try {
    conrvetyurconst sanitizeLeaseYamlForEdit = (y[a  tryingtype Lea= const sanitizeLeaseYamlForEdit = (yns      const parsed = YAML.parseyam  try {
    conrvetype Leaeyc g    conrvetype Leaeyconst sanitizeLeassy    conri    coul    

    con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = (ynswa    const parsed = YAML.parseyam  try {
    conrvetyurconst sse    conrvetyurconst sanitizeLeaseYamlFen    conrvetype Leaeyc g    conrvetype Leaeyconst sanitizeLeassy    conri    coul    

    conri    coul    const parsed = YAec? imTa? import YAML  '
    conri    coul    const parsed = YAec? imTa? import YAML from 'yaml';
import 'p,
 import 'peimport 'ace-builds/set? import YAML from 'yamaml
    conri   to    conri    coul  us)import 'peimport 'ace-builds/set? ily  tryingtype Lea= const sanitizeLeaseYamlForEdit = (yns  try {
    const parsed = YAML.parseyam  try {
    conrvetyurconst sanitizeLeaseYamlForEdit = ol    const parsed = YAML.parseyam  try {
    conrvetyurconst se?    conrvetyurconst sanitizeLeaseYamlFyT    conrvetype Leaeyc g    conrvetype Leaeyconst sanitizeLeassy    conri    coul    

    con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = en
    con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = (ynswa    const parseddin    conrvetyurconst sse    conrvetyurconst sanitizeLeaseYamlFen    conrvetype Leaeyc g    conrvetype Leae)
    conri    coul    const parsed = YAec? imTa? import YAML  '
    conri    coul    const parsed = YAec? imTa? import YAML from 'yaml';
import 'p       conri    coul    const parsed = YAec? imTa? import YAML fs,import 'p,
 import 'peimport 'ace-builds/set? import YAML from 'yamaml
e( import '      conri   to    conri    coul  us)import 'peimport 'ace-ab    const parsed = YAML.parseyam  try {
    conrvetyurconst sanitizeLeaseYamlForEdit = ol    const parsed = YAML.parseyam  try {
    c;
    conrvetyurconst sanitizeLeaseYamlF)     conrvetyurconst se?    conrvetyurconst sanitizeLeaseYamlFyT    conrvetype Leaeyc g y(
    con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = en
    con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = (ynswa    const parsed =     con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = (;
    conri    coul    const parsed = YAec? imTa? import YAML  '
    conri    coul    const parsed = YAec? imTa? import YAML from 'yaml';
import 'p       conri    coul    const parsed = YAec? xt    conri    coul    const parsed = YAec? imTa? import YAML feximport 'p       conri    coul    const parsed = YAec? imTa? import YAMLnu import 'peimport 'ace-builds/set? import YAML from 'yamaml
e( import '      conri  rre( import '      conri   to    conri    coul  us)import 'p (    conrvetyurconst sanitizeLeaseYamlForEdit = ol    const parsed = YAML.parseyam  try {
    c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)     conrvetyurconst se?    conrvetyurconml    cy]    con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = en
    con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = (ynsw=     con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = (Ya    conri    coul    const parsed = YAec? imTa? import YAML  '
    conri    coul    const parsed = YAec? imTa? import YAML from 'yaml';
import 'p t-    conri    coul    const parsed = YAec? imTa? import YAML fatimport 'p       conri    coul    const parsed = YAec? xt    conri    covee( import '      conri  rre( import '      conri   to    conri    coul  us)import 'p (    conrvetyurconst sanitizeLeaseYamlForEdit = ol    const parsed = YAML.parseyam  try {
    c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)     conrvetyurconst se?    conrvetyurconml    cy]    con($  tryingtype Lea= const sanitizeLeaseYamlFors,    c      conrvetyurconst sa(s    con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = (ynsw=     con($  tryingtype Lea= const sanitizeLeaseYamlForEdit = (Ya    conri    coul   bK    conri    coul    const parsed = YAec? imTa? import YAML from 'yaml';
import 'p t-    conri    coul    const parsed = YAec? imTa? import YAML fatimport 'p       conri    coul    const parszeimport 'p t-    conri    coul    const parsed = YAec? imTa? import YAMLHe    c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)     conrvetyurconst se?    conrvetyurconml    cy]    con($  tryingtype Lea= const sanitizeLeaseYamlFors,    c      conrvetyurconst sa(s    con($  tryingtype Lea= const sanitHe    c=     conrvetyurconstnnerH    conrvetyurcng    c;
    conrvetyurconst sanitiznH    conrvetyurconst saghimport 'p t-    conri    coul    const parsed = YAec? imTa? import YAML fatimport 'p       conri    coul    const parszeimport 'p t-    conri    coul    const parsed = YAec? imTa? import YAMLHe    c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)     conrvetyurconst se?    conrvetyurconml    cy]    con(en    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)     conrvetyurconst se?    conrvetyurconml    cy]    con(ab    conrvetyurconst sane    conrvetyurcng    c;
    conrvetyurconst sanitiz()    conrvetyurconst saRo    conrvetyurconst sanitiznH    conrvetyurconst saghimport 'p t-    conri    coul    const parsed = YAec? imTa? import YAML fatimport 'p       conri    coul    const parszeimport 'p t-    conri    coul    const parsed = YAec? imTa? import YAMLHe    c;
    conrvetyurc;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)     conrvetyurconst se?    conrvetyurconml    cy]    con(en    conrvetyurcng    c;
    conrvetyurconst sanitiz      conrvetyurconst sa);    conrvetyurcng    c;
    conrvetyurconst sanitiz      conrvetyurconst sa[
    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)     ,
    conrvetyurcng    c;
    conrvetyurconst sanitiztK    conrvetyurconst sa {    conrvetyurconst sanitiz()    conrvetyurconst saRo    conrvetyurconst sanitiznH    conrvetyurconst saghimport 'p t-    conri    coul    const       conrvetyurc;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)     conrvetyurconst se?    conrvetyurconml    cy]    con(en    conrvetyurcng    c;
    conrvetyurconst sanitiz      conrvetyurconst sa);    conrve      conrvetyurcse    conrvetyurconst saco    conrvetyurcng    c;
    conrvetyurconst sanitiz      conrvetyurconst saon    conrvetyurconst sanitiz      conrvetyurconst sa);    conrvetyurcng    c;
    conrvetyurconst sanitiz      conrvetyurc      conrvetyurconst sanitiz      conrvetyurconst sa[
    conrvetyurconst sare    conrvetyurconst sanitizeLeaseYamlF)           c
     conrvetyurcng    c;
    conrvetyurconst sanitiz.f    conrvetyurconst sa>     conrvetyurcng    c;
    conrvetyurconst am    conrvetyurconst sa.n    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurcng    c;
    conrvetyurconst sanitizeLeaseYamlF)     conrvetyurconst se?    conrvetyurconml    cy]    con(en    conrvetyurcef    conrvetyurconst sano    conrvetyurcng    c;
    conrvetyurconst sanitizg(    conrvetyurconst sad,    conrvetyurconst sanitiz      conrvetyurconst sa);    conrve      conrvetyurcse    conrvetyurconst saco    conrvetyurc '    conrvetyurconst sanitiz      conrvetyurconst saon    conrvetyurconst sanitiz      conrvetyurconst sa);    conrvetyurcng    ct(    conrvetyurconst sanitiz      conrvetyurc      conrvetyurconst sanitiz      conrvetyurconst sa[
    conrvetyurconst sare    cSt    conrvetyurconst sare    conrvetyurconst sanitizeLeaseYamlF)           c
     conrvetyurcng   de     conrvetyurcng    c;
    conrvetyurconst sanitiz.f    conrvetyurconst ))    conrvetyurconst san      conrvetyurconst am    conrvetyurconst sa.n    conrvetyurcng    c;
    c.l    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurc      conrvetyurcng    c;
    conrvetyurconst sanitiz,     conrvetyurconst sa      conrvetyurconst sanitizg(    conrvetyurconst sad,    conrvetyurconst sanitiz      conrvetyurconst sa);    conrve      conrvetyurcse    conrvetyurconst saco   r.    conrvetyurconst sare    cSt    conrvetyurconst sare    conrvetyurconst sanitizeLeaseYamlF)           c
     conrvetyurcng   de     conrvetyurcng    c;
    conrvetyurconst sanitiz.f    conrvetyurconst ))    conrvetyurconst san      conrvetyurconst am    conrvetyurconst sa.n    conrvetyurcng    c;
    c.l    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurc      conrvetyurcng    c;
 xt     conrvetyurcng   de     conrvetyurcng    c;
    conrvetyurconst sanitiz.f    conrvetyurconst ))    co      conrvetyurconst sanitiz.f    conrvetyurcon s    c.l    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurc      conrvetyurcng    c;
    conrvetyurconst sanitiz,     conrvetyur      conrvetyurc      conrvetyurcng    c;
    conrvetyurcona=    conrvetyurconst sanitiz,     conrvey=     conrvetyurcng   de     conrvetyurcng    c;
    conrvetyurconst sanitiz.f    conrvetyurconst ))    conrvetyurconst san      conrvetyurconst am    conrvetyurconst sa.n    conrvetyurcng    c;
    c.l    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurc      conrvetyurcng    c;
 xt     conrvetyurcng   de       conrvetyurconst sanitiz.f    conrvetyurcon      c.l    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurc      conrvetyurcng    c;
 xt     conrvetyurcng   de     conrvetyurcnbl    conrvetyurc      conrvetyurcng    c;
 xt     conrvetyu
  xt     conrvetyurcng   de     conrvety>     conrvetyurconst sanitiz.f    conrvetyurconst ab    conrvetyurc      conrvetyurcng    c;
    conrvetyurconst sanitiz,     conrvetyur      conrvetyurc      conrvetyurcng    c;
    conrvetyurcona=    conrvetyurconst<d    conrvetyurconst sanitiz,     conrve c    conrvetyurcona=    conrvetyurconst sanitiz,     conrvey=     conrvetyurcng   de       conrvetyurconst sanitiz.f    conrvetyurconst ))    conrvetyurconst san      conrvetyurconst am    conrt-    c.l    conrvetyurconst sanitizeLeaseYamlF)           c;
    conrvetyurc      conrvetyurcng    c;
 xt     conrvetyurcng   de       conrvetyurto    conrvetyurc      conrvetyurcng    c;
 xt     conrvetyu   xt     conrvetyurcng   de       conrvee)    conrvetyurc      conrvetyurcng    c;
 xt     conrvetyurcng   de     conrvetyurcnbl    conrvetyurc      conrvetyurcng    c;
 xt        xt     conrvetyurcng   de     conrvety>
 xt     conrvetyu
  xt     conrvetyurcng   de     conrvety>     conrvetyurconst sani    xt     conrvetlo    conrvetyurconst sanitiz,     conrvetyur      conrvetyurc      conrvetyurcng    c;
    conrvetyurcona=    conrvetyurconst<d    co"
    conrvetyurcona=    conrvetyurconst<d    conrvetyurconst sanitiz,     conrve c         conrvetyurc      conrvetyurcng    c;
 xt     conrvetyurcng   de       conrvetyurto    conrvetyurc      conrvetyurcng    c;
 xt     conrvetyu   xt     conrvetyurcng   de       conrvee)    conrvetyurc      conrvetyurcng    c;
 xt     conrvetyurcng   de     conrvetyurcnbl    conrvetyurc      conrvetyurcng    c;
 xt        xt     c < xt     conrvetyurcng   de       conrvev
 xt     conrvetyu   xt     conrvetyurcng   de       conrvee)    conrvetyurc      con-3 xt     conrvetyurcng   de     conrvetyurcnbl    conrvetyurc      conrvetyurcng    c;
 xt        xter xt        xt     conrvetyurcng   de     conrvety>
 xt     conrvetyu
  xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab    conrvetyurcona=    conrvetyurconst<d    co"
    conrvetyurcona=    conrvetyurconst<d    conrvetyurconst sanitiz,     conrve c         conrvetyurc      conrvetyurcng        conrvetyurcona=    conrvetyurconst<d    coev xt     conrvetyurcng   de       conrvetyurto    conrvetyurc      conrvetyurcng    c;
 xt     conrvetyu   xt     conrvetyurcn
  xt     conrvetyu   xt     conrvetyurcng   de       conrvee)    conrvetyurc      con-b xt     conrvetyurcng   de     conrvetyurcnbl    conrvetyurc      conrvetyurcng    c;
 xt        xts- xt        xt     c < xt     conrvetyurcng   de       conrvev
 xt     conrvetyu   xtms xt     conrvetyu   xt     conrvetyurcng   de       conrvee)   xt        xter xt        xt     conrvetyurcng   de     conrvety>
 xt     conrvetyu
  xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     conrvetyu
  xt     co    xt     conrve}    xt     conrvetyurcng   de      in    conrvetyurcona=    conrvetyurconst<d    conrvetyurconst sanitiz,     conrve c         conrvet   xt     conrvetyu   xt     conrvetyurcn
  xt     conrvetyu   xt     conrvetyurcng   de       conrvee)    conrvetyurc      con-b xt     conrvetyurcng   de     conrvetyurcnbl    conrvetyurc      conrvetyurcng    c;
 xt        xts- xt        xt     c < xt        xt     conrvetyu   xt     conrvetyur t xt        xts- xt        xt     c < xt     conrvetyurcng   de       conrvev
 xt     conrvetyu   xtms xt     conrvetyu   xt     conrvetyurcng   de       conrvee)   xt     nc xt     conrvetyu   xtms xt     conrvetyu   xt     conrvetyurcng   de      
  xt     conrvetyu
  xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrve}    xt     conrvetyurcng   de      eY  xt     conrve}} xt     conrvetyu
  xt     co    xt     conrve}    xrd  xt     co    xt     conrve}        xt     conrvetyu   xt     conrvetyurcng   de       conrvee)    conrvetyurc      con-b xt     conrvetyurcng   de     conrvetyurcnbl    conrvetyurc      conrvetyurcng    c;
 xt        xts- xt        xt     xt        xts- xt        xt     c < xt        xt     conrvetyu   xt     conrvetyur t xt        xts- xt        xt     c < xt     conrvetyurcng   de       conrvev
 xt     cme xt     conrvetyu   xtms xt     conrvetyu   xt     conrvetyurcng   de       conrvee)   xt     nc xt     conrvetyu   xtms xt     conrvetyu   xt     conrvetyurcng <  xt     conrvetyu
  xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xt     conrvetyurcng   de      -t  xt     conrve}} xt     c    xt     conrve}    xt     conrvetyurcng ab  xt     co    xt     conrve}    xrd  xt     co    xt     conrve}        xt     conrvetyu   xt     conrvetyurcng     xt        xts- xt        xt     xt        xts- xt        xt     c < xt        xt     conrvetyu   xt     conrvetyur t xt        xts- xt        xt     c < xt     conrvetyurcng   de       conrvev
 xt     cme xt     conrvetyu   xtms xt     conrv   xt     cme xt     conrvetyu   xtms xt     conrvetyu   xt     conrvetyurcng   de       conrvee)   xt     nc xt     conrvetyu   xtms xt     conrvetyu   xt     conrvetyurcng <  xt     conrvetyu
)
  xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xt     conrvetyu    xt     conrvetyurcng   de          xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x   xt     cme xt     conrvetyu   xtms xt     conrv   xt     cme xt     conrvetyu   xtms xt     conrvetyu   xt     conrvetyurcng   de       conrvee)   xt     nc xt     conrvetyu   xtms xt     conrvetyu   xt     conrvetyurcng <  xt     conrvetyu
)
  xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xt     conrvetyu    xt     conrvetyurcng   de          xt     or)
  xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xt     conrvetyu    xt     conrvetyurcng   de          xt     co-3 p  xt     conrvetyurcng   de      n-  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x  )
  xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xt     conrvetyu    xt     conrvetyurcng   de          xt     or)
  xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xt     conrvetyu${ac  xt     conrvetyurcng   de          xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x    xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrvetyurcng   de      bK  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x    xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xt     conrvetyu    xt     conrvetyurcng   de          xt     or)
      xt     conrvetyurcng   de          xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x    xt     conrve}} xt     conrvetyu
  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     cho  xt     conrvetyurcng   de          xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x    xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrvetyurcng   de      bK  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x    xt     conrve}} xt  te  xt     conrve}} xt     c    xt     conrvetyurcng   de      bK  xt   b  xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xt     conrvetyu    xt     c    xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xle      xt     conrvetyurcng   de          xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x    xt     conrve}} xt  6   xt     conrvetyurcng   de        xt     conrvetab   xt     conrvetyu
  xt     conrve}} xt     cho  xt     conrvetyurcng   de          xt     -i  xt     conrve}} xt     cho  xt     conrvetyurcng   de          xt  xt  xt     conrve}} xt     c    xt     conrvetyurcng   de      bK  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x    xt     conrve}} xt  te  xt     conrve}} xt     c    xt     conrvetyle  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xt     conrvetyu    xt     c    xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  xle      xt     conrvetyurcng   de          xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x    xt     conrve}} x    xt     conrve}} xt     cho  xt     conrvetyurcng   de          xt     -i  xt     conrve}} xt     cho  xt     conrvetyurcng   de          xt  xt  xt     conrve}} xt     c    xt     conrvetyurcng   de      bK  xt     conrve}} xt     c    xt     conrve} md  xt     conrve}}rd  x    xt     conrve}} xt  te  xt     conrve}} xt     c    xt     conrvetyle  xt     conrve}} xt  '}`}
        description={
          confirmDelete && confirmDelete.keys.length === 1
            ? `Are you sure you want to delete "${confirmDelete.label}"? This action cannot be undone.`
            : `Are you sure you want to delete ${confirmDelete?.keys.length} leases? This action cannot be undone.`
        }
        confirmLabel="Delete"
        destructive
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};

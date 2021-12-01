(* NIM/Nama  :	1. 16511059 Fransiskus Xaverius Christian
				2. 16511083 Alvin Aditya
				3. 16511143 Aldy Wirawan
				4. 16511203 Muhamad Ihsan
				5. 16511323 Faiz Ilham Muhammad *)
(* Nama file : TB_05_04.pas*) 
(* Topik     : Tugas Besar PTI A*) 
(* Tanggal   : 9 Desember 2011*)
(* Deskripsi : Tugas Besar PTI A - Hangman*)
(* Pembagian Tugas :         
1. 16511059 Fransiskus Xaverius Christian
	help(), gbr_delay(), gambar_hangman(), gameplay(), gamestart()
2. 16511083 Alvin Aditya
	save_user(), load_user(), gantikata(), load_kata()
3. 16511143 Aldy Wirawan
	randomkata(), randomkata2(), cari(), CekKategori(), gameplay()
4. 16511203 Muhamad Ihsan
	highscore(), info(), prog_init(), program utama, gameplay(), gamestart()
5. 16511323 Faiz Ilham Muhammad
	merge(), merge_sort(), menu(), new_player(), sel_player(), sel_player2(), yesno(), gameplay(), gameplay2()


*) 
//{$R hangman.rc} {compiler directives, untuk attach icon ke file exe nya. hilangkan // didepannya untuk mencoba :)}
program hangman;

uses crt;

const
	max_kata = 100;
	max_player = 500; //dinaikkan dari batas minimum spec: 100
	max_length = 50;
	kata_per_kategori = 20; //jumlah kata tiap kategori
	
type
	player = record  // data user
		name : string;
		score : integer;
		pass : string;
		battlewin : integer;	//berapa kali memenangkan 2 player mode
		battle : integer;	//berapa kali bermain 2 player mode
		tebak : array[1..max_kata] of integer; //daftar id kata pada array daftar kata yg telah ditebak
		n_tebak: integer; //indeks efektif array tebak
	end;
	
	arr_user =  record  // record seluruh user
		n: integer;  // indeks efektif
		data: array[1..max_player] of player; //array data
	end;
	
	arr_kata = record // record untuk kata
		n: integer; //indeks efektif
		soal: array[1..max_kata] of string[max_length]; //kata yang akan ditebak
		clue: array[1..max_kata] of string; //petunjuk
	end;
	
var
	{database}
	user : arr_user; //data user
	kata : arr_kata; //data kata dan petunjuk
	
	{global status}
	log_id : integer; // id user yang sedang ol [1..user_max], 0 jika tidak ada
	
	{user marks}
	item : integer; // menampung nomor menu yg dipilih user
	quit : boolean; //penanda keluar
	
	{---------------------------------------------------------functions and procedures----------------------------------------------------------------------}
	
	function cari(x: string): integer;
	(*mencari nama dalam array user. mengembalikan indeks nama dalam array nama user, 0 jika tidak ada
	by: 16511143 Aldy Wirawan*)
	var
		i:integer;
	begin
		if user.n = 0 then cari:=0
		else begin
			i:=1;
			while (i < user.n) and (user.data[i].name <> x) do
				inc(i);
		
			if user.data[i].name = x then
				cari:=i
			else
				cari:=0;
		end;
	end;
	
	function yesno(question : string):boolean;
	//interaksi yes-no dengan pengguna
	//fs: mengembalikan pilihan pengguna. yes : true, no : false;
	//by : 16511323 Faiz Ilham Muhammad
	var
		x, y : integer;
		c : char;
	begin
		cursoroff;
		x:=length(question) + 2;
		y:=whereY;  //posisi kursor secara vertikal saat yesno() dipanggil
		writeln(question,'   Yes   No');
		repeat
			gotoxy(x,y);
			write('>');
			c:=readkey;
			if c = #75 then begin  //tombol panah kiri
				if x=length(question) + 8 then begin
					gotoxy(x,y);
					write(' '); //hapus tanda >
					x:=length(question) + 2;
				end;
			end else if c =#77 then begin //tombol panah kanan
				if x=length(question) + 2 then begin
					gotoxy(x,y);
					write(' '); //hapus tanda >
					x:=length(question) + 8;
				end;
			end;
		until c = #13;
		gotoxy(1,y+1);
		yesno:= x=length(question) + 2
	end;
	
	procedure load_kata();
	(*deskripsi: mengisi array kata dari file kata.dat
	IS: file kata.dat ada, dengan format per barisnya <soal>#<clue>
	FS: array kata terisi
	by: 16511083 Alvin Aditya*)
	var
		f: text;
		s: string;
		x: integer;
	begin
		kata.n:=0;
		assign(f, 'res/kata.dat');
		reset(f);
		while (not eof(f)) and (kata.n < max_kata) do begin
			kata.n := kata.n + 1;
			
			readln(f,s);
			x:=pos('#',s); //mencari posisi # pada string yg dibaca
			
			//memenggal string pada posisi karakter #
			//yang didepan # adalah soal, yg dibelakangnya adalah petunjuk
			
			kata.soal[kata.n]:=upcase(copy(s, 1, x-1));
			delete(s,1,x);
			kata.clue[kata.n]:=upcase(s);
			
		end; //sampai pada akhir file
		close(f);
	end;
	
	procedure save_user();
	(*deskripsi: menyimpan array user
	IS : user sudah ada/terisi
	FS : user tersimpan di user.dat
	by : 16511083 Alvin Aditya*)
	var
		fi : file of player;
		i : integer;
	begin
		assign(fi, 'res/user.dat');
		rewrite (fi);
		for i := 1 to user.n do
		begin
			write (fi,user.data[i]);
		end; close(fi);
	end;
	
	procedure load_user();
	(*deskripsi: menyimpan array user
	IS : user sudah ada/terisi
	FS : user tersimpan di user.dat
	by : 16511083 Alvin Aditya*)
	var
		f : file of player;
		reader : player;
	begin
		user.n:= 0;
		assign(f, 'res/user.dat');
		reset (f);
		user.n:=0;
		while not eof(f) do begin //baca sampai file habis
			inc(user.n);
			read(f,reader);
			user.data[user.n]:=reader;
		end;
		close(f);
	end;
	
	function menu(start:integer): integer;
	//desc: menampilkan menu utama, mengembalikan nomor menu yang dipilih user
	//by : 16511323 Faiz Ilham Muhammad
	const space = 5; //spasi saja

	var 
		c : char; 
		k : array[1..8] of char; // penyimpan penanda menu, spasi jika sedang tdk dipilih dan '>' jika dipilih
		curr_pos : integer; //nomor menu yang sedang dipilih user
		item : integer;	//jumlah menu yang ditampilkan
		i : integer;
	
	begin
		cursoroff;	clrscr; //bersihkan layar, matikan kursor
			
		writeln('         ____');
		writeln('        |    |                            ____');
		writeln('        |    O    |    |    /\    |\   | |      |\    /|    /\    |\   |       ');
		writeln('        |   /|\   |____|   /__\   | \  | |  __  | \  / |   /__\   | \  |       ');
		writeln('        |    |    |    |  /    \  |  \ | |    | |  \/  |  /    \  |  \ |       ');
		writeln('        |   / \   |    | /      \ |   \| |____| |      | /      \ |   \|       ');
		writeln('        |');
		writeln('________|______________________________________________________________________');
		
		//inisialisasi
		item:=8;
		if log_id = 0 then item := 5; // jika user belum online, hanya tampilkan 5 item menu saja
	
		for i:=1 to item do k[i]:=' ';
		curr_pos:=start;	//menu yang di-highlight pertama kali adalah parameter fungsi
	
		if log_id = 0 then writeln	//tidak ada yg login
		else if user.data[log_id].n_tebak = 0 then writeln('Welcome '+user.data[log_id].name+'!':78) //user yg baru pertama kali mendaftar
		else writeln('Howdy, '+user.data[log_id].name:78);	//user yg pernah main
		
		writeln(' ':space, 'New Player');
		writeln(' ':space, 'Select Player');
		if log_id <> 0 then begin 			//menu play!, battle! dan info baru bisa dibuka jika user online
			writeln(' ':space, 'Play!');
			writeln(' ':space, 'Battle! (2 Player Mode)');
			writeln(' ':space, 'Player Info');
		end;
		writeln(' ':space, 'Highscore');
		writeln(' ':space, 'Help');
		writeln(' ':space, 'Exit');
		repeat
			k[curr_pos]:='>'; //menu pada posisi yg sedang dipilih ditandai
			for i:=1 to item do begin 
				gotoxy(space-1,9+i);			//menaruh karakter penanda menu pada tempat yang tepat
				write(k[i]);
			end;
		
			c:= readkey; //membaca tombol keyboard yang di klik
		
			case c of
				#72: begin //tombol up 
					k[curr_pos]:=' ';
					
					if curr_pos<>1 then //jika tidak di menu paling atas
						curr_pos:= curr_pos - 1 //naik 
						
					else 				//jika di menu paling atas
						curr_pos:= item; //ke menu paling bawah
					end;
				#80: begin //tombol down
					k[curr_pos]:=' ';
					
					if curr_pos<>item then //jika tidak di menu paling bawah
						curr_pos:= curr_pos + 1 //turun
						
					else				//jika di menu paling bawah
						curr_pos:=1;	//ke menu paling atas
					end;
			end;
		until c = #13; //tombol enter / carriage return = user memilih membuka menu tertentu
		menu:=curr_pos;
	end;
	
	procedure new_player();
	{desc: registrasi pemain baru
	prosedur meminta user memasukkan nama dan password.
	jika nama tsb tidak ada dlm array data pemain (belum dipakai), masukkan ke dalam data dan simpan
	by: 16511323 Faiz Ilham Muhammad}
	
	var
		valid, proceed: boolean;
		newuser : player;
		i: integer;
	begin
		if user.n = max_player then begin
			clrscr; write('Maximum number of user reached, registration denied. Press anykey to go back to menu'); readkey;
		end else begin
			repeat
				cursoron; clrscr; 
				writeln('Register New Player');
				writeln;
				
				repeat
					write('Username (case sensitive): '); readln(newuser.name);
					valid:= cari(newuser.name) = 0;
					
					if not valid then begin		//jika username sudah ada
						gotoxy(1,6);
						writeln('Username "', newuser.name,'" already taken!');
						
						//bersihkan baris 3, utk interface saja
						gotoxy(1,3);
						writeln(' ':80);
						gotoxy(1,3);
					end else if newuser.name='' then begin //jika username belum terisi
						gotoxy(1,6);
						writeln('Please input your username!');
						
						//bersihkan baris 3, utk interface saja
						gotoxy(1,3);
						writeln(' ':80);
						gotoxy(1,3);
						
						valid:=false;
					end;
				until valid;
				
				//bersihkan baris 4, utk interface saja
				gotoxy(1,6);
				writeln(' ':80);
				gotoxy(1,4);
				
				repeat
					write('Password (case sensitive): '); readln(newuser.pass);
					valid:= length(newuser.pass) > 3;		//spesifikasi password: harus lebih panjang dari 3 karakter
					if not valid then begin
						gotoxy(1,6);
						writeln('Password length should be more than 3 characters!');
						
						//bersihkan baris 4, utk interface saja
						gotoxy(1,4);
						writeln(' ':80);
						gotoxy(1,4);
					end;
				until valid;
				
				//bersihkan baris 6, utk interface saja
				gotoxy(1,6);
				writeln(' ':80);
				gotoxy(1,6);
				
				cursoroff;
				proceed:=yesno('Are you sure to create new user?');
				if proceed then begin
					newuser.n_tebak:=0;
					newuser.score:=0;
					newuser.battle:=0;
					newuser.battlewin:=0;
					for i:=1 to max_kata do newuser.tebak[i]:=0;
					user.n:=user.n+1;
					user.data[user.n]:=newuser;
					log_id:=user.n;
					
					save_user();
					write('Registration success! Press anykey to go back to menu'); readkey;
				end else begin
					proceed:=yesno('Cancel registration?');
					if proceed then begin
						write('Registration canceled. Press anykey to go back to menu'); readkey;
					end;
				end;
			until proceed;
		end;
	end;
	
	procedure sel_player();
	{desc: login / ganti pemain
	prosedur meminta user memasukkan nama dan password.
	jika nama dan passwd sesuai dengan data, user dianggap telah login
	by: 16511323 Faiz Ilham Muhammad}
	var
		nama, pass: string;
		k:integer;
		quit:boolean;
	begin
		if user.N = 0 then begin	//kalo belum ada user yang mendaftar
			clrscr; 
			write('No user has been registered! Press anykey to go back to menu'); readkey;
		end else begin
			quit:=false;
			repeat
				clrscr;	cursoron;
				writeln('Login');
				writeln;
				write('Username : '); readln(nama);
				write('Password : '); readln(pass);
				writeln;
				k:=cari(nama);	//cari username
				if k = 0 then begin	//k=0 --> username tidak ditemukan atau username tidak diisi
				
					if nama<>'' then //username diisi, tapi tidak ditemukan
						quit:=not yesno('User "'+nama+'" doesn''t exist! Retry login?')
					else //username tidak diisi
						quit:=not yesno('Please input your username! Retry login?');
				end else 
					if user.data[k].pass = pass then begin	//jika passwordnya benar
						log_id:=k;	  // id user yg login
						quit:=true; // login berhasil
						
						cursoroff;
						write('Login success! Press anykey to go back to menu'); readkey;
					end else begin
						quit:=not yesno('Wrong Password! Retry login?');
					end;
			until quit; //jika ga jadi login, atau berhasil login
		end;
	end;

	procedure highscore(user: arr_user);
	{desc: mencetak informasi user yg sedang ol berupa nama, skor tertinggi dan
	kata yang pernah ditebak
	I.S.: user ada yang sudah login (log_id<>0)
	F.S.: menampilkan data user
	by: 16511203 Muhamad Ihsan (prosedur utama) and 16511323 Faiz Ilham Muhammad (sub-prosedur)}
	var
			i:integer;
			byScore: boolean;
		
		
		procedure merge(left, right: arr_user; var result : arr_user);
		{menggabung 2 array (kiri dan kanan) sambil mengurutkan
		ringkasan: bandingkan tiap elemen pertama kiri dan kanan, jika kiri > kanan masukkan yg kiri, jika tidak masukkan yang kanan
		by: 16511323 Faiz Ilham Muhammad}
		var
			leftpos, rightpos:integer;
		begin
			result.n:=0; leftpos:=1; rightpos:=1;
			while (leftpos<=left.n) or (rightpos<=right.n) do begin
				inc(result.n);
				if (leftpos<=left.n) and (rightpos<=right.n) then begin
					if byScore and (left.data[leftpos].score > right.data[rightpos].score) then begin //urut berdasarkan skor, kiri > kanan
						result.data[result.n]:=left.data[leftpos];
						inc(leftpos); //elemen berikutnya menjadi "elemen pertama"
					end else if not byScore and (upcase(left.data[leftpos].name) > upcase(right.data[rightpos].name)) then begin //berdasarkan nama, kiri > kanan
						result.data[result.n]:=left.data[leftpos];
						inc(leftpos);
					end else begin //jika kiri <= kanan, baik berdasarkan skor ataupun nama
						result.data[result.n]:=right.data[rightpos];
						inc(rightpos);
					end;
				end else if (leftpos<=left.n) then begin //jika array kanan "habis"
					result.data[result.n]:=left.data[leftpos];
					inc(leftpos);
				end else begin //jika array kiri "habis"
					result.data[result.n]:=right.data[rightpos];
					inc(rightpos);
				end;
			end;
		end;
		
		procedure merge_sort(var result : arr_user);
		{merge sort
		by 16511323 Faiz Ilham Muhammad}
		var 
			left, right : arr_user;
			mid, i : integer;
		begin
			if result.n > 1 then begin
				mid:= result.n div 2;
				left.n:=0; right.n:=0;
				
				//membagi 2 array, kiri dan kanan
				
				for i:=1 to mid do begin
					inc(left.n);
					left.data[left.n]:=result.data[i];
				end;
				
				for i:=mid+1 to result.n do begin
					inc(right.n);
					right.data[right.n]:=result.data[i];
				end;
				
				merge_sort(left); merge_sort(right); //urut merge array kiri dan array kanan
				merge(left, right, result); //gabungkan kiri dan kanan
			end;		
		end;
		
	begin
		{by: 16511203 Muhamad Ihsan}
		clrscr;
		if user.N = 0 then begin	//kalo belum ada user yang mendaftar
			write('No user has been registered! Press anykey to go back to menu'); readkey;
		end else begin
			byScore:=false;		//urut berdasarkan nama
			merge_sort(user);
			
			byScore:=true;		//urut berdasarkan skor
			merge_sort(user);
			
			writeln();
			writeln('o  o  o  oooo  o  o  ooo  oooo  oooo  oooo  oooo':64);
			writeln('o  o  o  o     o  o  o    o     o  o  o  o  o   ':64) ;
			writeln('oooo  o  o oo  oooo  ooo  o     o  o  ooo   oooo':64)  ;
			writeln('o  o  o  o  o  o  o    o  o     o  o  o  o  o   ':64)   ;
			writeln('o  o  o  oooo  o  o  ooo  oooo  oooo  o  o  oooo':64)    ;
			writeln();
			
			//tulis daftar highscorenya
			i := 1;
			if (user.n<10) then //user yang ada < 10
			begin
				repeat
					writeln(i, '. ', user.data[i].name, ' (', user.data[i].score, ')');
					i := i + 1;
				until (i>user.n)
			end else
			begin
				repeat
					writeln(i, '. ', user.data[i].name, ' (', user.data[i].score, ')');
					i := i + 1;
				until (i=11);
			end;
			writeln;
			write('Press anykey to go back to menu'); readkey;
		end;
	end;
	
	procedure gantikata (s:string; var s1 : string; var x : integer);
	(*deskripsi: mengubah anggota kata pilihan [A..Z] menjadi karakter '_' tetapi spasi dan tanda sambung tidak diubah
	IS : s adalah input kata dalam string
	FS : s1 adalah bentukan akhir dari kata dalam kumpulan '_', dan x menunjukkan jumlah huruf yang telah ditebak
	by : 16511083 Alvin Aditya*)
	var 
	i:integer;
	begin
		x := 0;
		s1:='';
		for i:=1 to length(s) do
		begin
			if (s[i] in ['A'..'Z', 'a'..'z']) then begin
				s1:=s1 + '_';
				x := x+1;
			end else begin
				s1:=s1 + s[i];
			end;
		end;
	end;

	procedure gambar_hangman (salah:integer);
	{memunculkan gambar hangman sesuai dengan jumlah kesalahan yang dilakukan }
	{I.S.: memunculkan gambar tiang}
	{F.S.: memunculkan gambar orang tergantung sesuai jumlah kesalahan pengguna
	by : 16511059 Fransiskus Xaverius Christian}

	begin
		case salah of
		0:	begin
				gotoxy(3,2);write('_____');
				gotoxy(2,3);write('|');
				gotoxy(2,4);write('|');
				gotoxy(2,5);write('|');
				gotoxy(2,6);write('|');
				gotoxy(2,7);write('|');
				gotoxy(2,8);write('|');
				gotoxy(1,9);write('_|________');
			end;
		1:	begin
				gotoxy(8,3);write('|');
			end;
		2:	begin
				gotoxy(8,4);write('O');
			end;
		3:	begin
				gotoxy(8,5);write('|');
			end;
		4:	begin
				gotoxy(7,5);write('/');
			end;
		5:	begin
				gotoxy(9,5);write('\');
			end;
		6:	begin
				gotoxy(8,6);write('|');
			end;
		7:	begin
				gotoxy(7,7);write('/');
			end;
		8:	begin
				gotoxy(9,7);write('\');
			end;
		end;
	end;
	
	procedure gameplay();
	{bagian game
	IS: user sudah login (log_id<>0); array kata terdefinisi;
	FS:	game selesai, kata yang dimainkan dicatat pada data user, skor baru jika > sebelumnya dicatat juga
	by: 16511059 Fransiskus Xaverius Christian
		16511143 Aldy Wirawan
		16511203 Muhamad Ihsan
		16511323 Faiz Ilham Muhammad }
	var
		c: char;
		quit, respond, b:boolean;
		selectcategory, showspace, showused :boolean;
		jawab, search, used, inputs: string;
		x, k, i: integer;
		remain, skor, salah, category : integer;
		
		function randomkata () : integer;
		(*mengembalikan indeks dari soal yang belum pernah ditebak user
		by: 16511143 Aldy Wirawan*)
		var x : integer; //indeks soal yang di random
			i : integer; //indeks dari kata yang sudah pernah ditebak user
			b : boolean; //variabel boolean bantuan untuk table lookup
		begin
			repeat
				randomize; 
				x := random (kata.n) + 1; //untuk merandom indeks soal
				i:=1; //inisialisasi variabel indeks, berada di dalam repeat karena indeks kata yang sudah pernah ditebak user harus dikembalikan ke awal lagi untuk setiap pengecekan
				b:=true;
				if user.data[log_id].n_tebak > 0 then begin
					while (i<user.data[log_id].n_tebak) and (user.data[log_id].tebak[i]<>x) do //loop untuk mencari nilai yang sama 
						begin
							i := i + 1;
						end;
					if user.data[log_id].tebak[i]=x then
						begin
							b := false;
						end;
				end;
			until (b = true);
			randomkata:=x;
		end;
		
		function randomkata2 () : integer;
		(*mengembalikan indeks dari soal yang belum pernah ditebak user untuk selectcategory true
		by: 16511143 Aldy Wirawan*)
		var x : integer; //indeks soal yang di random
			i : integer; //indeks dari kata yang sudah pernah ditebak user
			b : boolean; //variabel boolean bantuan untuk table lookup
			y : integer; //penambahan indeks sehingga termasuk kategori tertentu
		begin
			y := (category-1)*20;
			repeat
				randomize; 
				x := random (20) + 1 + y; //untuk merandom indeks soal
				i:=1; //inisialisasi variabel indeks, berada di dalam repeat karena indeks kata yang sudah pernah ditebak user harus dikembalikan ke awal lagi untuk setiap pengecekan
				b:=true;
				if user.data[log_id].n_tebak > 0 then begin
					while (i<user.data[log_id].n_tebak) and (user.data[log_id].tebak[i]<>x) do //loop untuk mencari nilai yang sama 
						begin
							i := i + 1;
						end;
					if user.data[log_id].tebak[i]=x then
						begin
							b := false;
						end;
				end;
			until (b = true);
			randomkata2:=x;
		end;
		
		function CekKategori (k : integer) : boolean;
		(*memeriksa apakah player sudah memainkan semua kata dalam suatu kategori (hasil true) atau belum (hasil false)
		by: 16511143 Aldy Wirawan*)
		var
			i : integer; //variabel indeks bantuan pertama
			i2 : integer; //variabel indeks bantuan kedua
			j : integer; //jumlah kata dalam suatu kategori yang sudah ditebak
			
		begin
			j := 0;
			for i := 1 + ((k-1)*20) to 20 + ((k-1)*20) do
			begin
				for i2:= 1 to user.data[log_id].n_tebak do
				begin
					if user.data[log_id].tebak[i2] = i then begin
						j:=j+1;
					end;
				end;
			end;
			if j = kata_per_kategori then begin 
				CekKategori := true;
			end else begin
				CekKategori := false;
			end;
		end;
		
	begin
		{bagian persiapan setting gameplay}
		{by: 16511059 Fransiskus Xaverius Christian, 16511203 Muhamad Ihsan}

		clrscr;
		cursoron;
		if user.data[log_id].n_tebak < kata.n then begin
			writeln('New Game Settings');
			selectcategory := yesno('Select category?');
			if selectcategory then begin
				cursoron;
				writeln ('Category selection : 1. games');
				writeln ('                     2. capital cities');
				writeln ('                     3. famous person');
				writeln ('                     4. movies');
				writeln ('                     5. songs');
				write ('Insert selection (1-5) :'); readln (category);
				b:= CekKategori(category);
				while((category<1) or (category>5)) or b do
				begin
					gotoxy(1,10); writeln(' ':80); gotoxy(1,10);
					if b then writeln('You''ve played all words in that category!')
					else writeln('Input number should between 1-5!');
					gotoxy(1,8); writeln(' ':80); gotoxy(1,8);
					write ('Insert selection (1-5) :'); readln(category);
					b:= CekKategori(category);
				end;
			end;
			writeln;
			showspace := yesno('Show space between words and other punctuation?');
			showused := yesno('Cannot enter used letters?');
			writeln;
			write('Loading, please wait...');
			for i:=1 to 50 do begin
				gotoxy(24,whereY());
				write(i*2:4,'%');
				delay(40);
			end;
			delay(500);
		end else begin
			writeln('You have guessed all words! Press anykey to go back to menu');
			readkey;
		end;
		
		{gameplay}
		{by: 16511143 Aldy Wirawan, 16511323 Faiz Ilham Muhammad }
		repeat
			clrscr;
			cursoron;
			if (user.data[log_id].n_tebak < kata.n) and not CekKategori(category) then begin //masih ada kata yg bisa dimainkan
			
				// pilih kata secara acak
				if selectcategory=false then begin
					x:=randomkata();
				end else begin
					x:=randomkata2();
				end;
				
				//inisialisasi
				search:=kata.soal[x];
				gantikata(search, jawab, remain);
				salah:=0;
				used:='';
				
				repeat
					gambar_hangman(salah);
					gotoxy(1,15); writeln(' ':80); //hapus baris input char
					gotoxy(1,11);
					
					//tulis kata yang sedang dimainkan dalam bentuk _ _ _ _  _ _ _ 
					for i:=1 to length(jawab) do
						if showspace or (jawab[i] in ['_', 'a'..'z','A'..'Z']) then write(jawab[i],' ');
						
					writeln;
					
					writeln('category: ',kata.clue[x]);
					
					//huruf yang pernah dipakai
					if showused then begin
						write('used letter: ');
						
						if length(used)=0 then writeln('-')
						else writeln(used);
					end;
					writeln;
					
					if showused then begin
						//jika huruf yg dipakai ditampilkan
						repeat
							gotoxy(1,15);
							readln(inputs);
							gotoxy(1,16); writeln(' ':80); gotoxy(1,16);  //hapus baris peringatan
							
							if length(inputs)=1 then begin
								c:=upcase(inputs[1]);
								if not (c in ['a'..'z','A'..'Z']) then writeln('Please input letter only!')
								else if (pos(c, used) <> 0) then writeln('You have use letter ',c,'!');
							end else begin
								c:=#0;
								writeln('Please input 1 character!');
							end;
							gotoxy(1,15); writeln(' ':80); //hapus baris input char
						until (c in ['a'..'z','A'..'Z']) and (pos(c, used) = 0);
						
						if pos(c, used) = 0 then used:= used + c + ' ';
					end else begin
						//jika tidak
						repeat
							gotoxy(1,15);
							readln(inputs);
							gotoxy(1,16); writeln(' ':80); gotoxy(1,16);  //hapus baris peringatan
							
							if length(inputs)=1 then begin
								c:=upcase(inputs[1]);
								if not (c in ['a'..'z','A'..'Z']) then writeln('Please input letter only!');
							end else begin
								c:=#0;
								writeln('Please input 1 character!');
							end;
							gotoxy(1,15); writeln(' ':80); //hapus baris input char
						until (c in ['a'..'z','A'..'Z']);
					end;
					
					repeat
						k := pos(c, search);	//cari posisi huruf dalam kata
						if k<>0 then begin
							jawab[k]:=c;	
							search[k]:=' '; //biar ga ketemu lagi
							remain:=remain - 1; //kurangi jumlah huruf yang perlu ditebak lagi
						end;
					until k = 0;
					
					if pos(c,kata.soal[x])=0 then salah:=salah+1; //kalo ga ada berarti salah
					
				until (salah = 8) or (remain = 0); //salah 8 atau huruf yang perlu ditebak sudah habis
				
				gotoxy(1,13);
				if showused then begin
					write('used letter: ');
					
					if length(used)=0 then writeln('-')
					else writeln(used);
				end;
					
					
				if salah = 8 then begin //salah 8
					gambar_hangman(8);
					gotoxy(1,16); writeln('Game Over! The solution is ', kata.soal[x]);
				end else begin		//semua huruf tertebak
					gotoxy(1,11);
					for i:=1 to length(kata.soal[x]) do 
						if showspace or (kata.soal[x,i] in ['_', 'a'..'z','A'..'Z']) then write(kata.soal[x,i],' ');
										writeln();
					
					gotoxy(1,16);
					skor:= 100 - (salah*salah);
					writeln('You win! Your score is ', skor);
					
					if user.data[log_id].score<skor then begin
						respond:=yesno('New highscore reached! Record this score to your profile?'); //tanya user masukkan ke highscore/tidak
						if respond then user.data[log_id].score:=skor;
					end;
				end;
				//simpan kata yg baru dimainkan
				inc(user.data[log_id].n_tebak);
				user.data[log_id].tebak[user.data[log_id].n_tebak]:=x;
				
				save_user();
				
				quit:=not yesno('Play again? (using same settings)');
			end else if (user.data[log_id].n_tebak < kata.n) and CekKategori(category) then begin  // semua kata dalam 1 kategori habis
				writeln('You have guessed all words in this category! Press anykey to go back to menu');
				readkey;
				quit:=true;
			end else begin	//semua kata habis dimainkan
				writeln('You have guessed all words! Press anykey to go back to menu');
				readkey;
				quit:=true;
			end;
		until quit;
	end;
	
	procedure gameplay2();
	{2 player mode. 2 player login, saling memberikan pertanyaan untuk dijawab dengan memakai hangman}
	var
		log_id2:integer; //id player 2
		i, j, salah, remain, k : integer;
		start : boolean;
		showclue, showspace, showused :boolean;
		soal, clue: array[1..2] of string;
		skor: array[1..2] of integer;
		search, jawab, used, inputs:string;
		c: char;
		
		
		function sel_player2():boolean;
		{desc: login untuk player 2
		fungsi meminta user memasukkan nama dan password.
		jika nama dan passwd sesuai dengan data, user dianggap telah login
		mengembalikan true jika login berhasil, false jika batal login
		by: 16511323 Faiz Ilham Muhammad}
		var
			nama, pass: string;
			k:integer;
			quit:boolean;
			
		begin
			clrscr;
			if user.n>1 then begin
				quit:=false;
				log_id2:=0;
				repeat
					clrscr; cursoron;
					writeln('Login Player 2');
					writeln;
					write('Username : '); readln(nama);
					write('Password : '); readln(pass);
					writeln;
					k:=cari(nama);	//cari username
					if k = 0 then begin	//k=0 --> username tidak ditemukan atau username tidak diisi
					
						if nama<>'' then //username diisi, tapi tidak ditemukan
							quit:=not yesno('User "'+nama+'" doesn''t exist! Retry login?')
						else //username tidak diisi
							quit:=not yesno('Please input your username! Retry login?');
					end else 
						if k = log_id then begin //jika berusaha login dengan id user yang sudah login
						
							quit:=not yesno('User "'+user.data[k].name+'" has logged in! Retry login?');
							
						end else if user.data[k].pass = pass then begin	//jika passwordnya benar
							log_id2:=k;	  // id user yg login
							quit:=true; // login berhasil
							
							cursoroff;
							write('Login success! Press anykey to start'); readkey;
						end else begin
							quit:=not yesno('Wrong Password! Retry login?');
						end;
				until quit; //jika ga jadi login, atau berhasil login
				sel_player2:= log_id2<>0;
			end else begin
				writeln('Only 1 player has been registered! 2 player mode game can''t be started.');
				write('Press anykey to go back to menu'); readkey;
				sel_player2:= false;
			end;
		end;
		
		procedure game_start();
		{setting awal 2 player mode game
		by: 16511059 Fransiskus Xaverius Christian, 16511203 Muhamad Ihsan}
		begin
			clrscr;
			writeln('New Game Settings');
			showclue := yesno('Use clues?');
			showspace := yesno('Show space between words and other punctuation?');
			showused := yesno('Cannot enter used letters?');
			
			cursoron;
			
			{set soal. player 1 memberi soal untuk player 2 dan sebaliknya}
			repeat
				clrscr;
				writeln('For Player 1 (',user.data[log_id].name,'), set the question for Player 2!');
				write('Question : ');readln(soal[2]);
				soal[2]:=upcase(soal[2]);
				if showclue then begin 
					write('Clue : ');
					readln(clue[2]);
					clue[2]:=upcase(clue[2]); 
				end;	
			until yesno('Are you sure?');
			
			repeat
				clrscr;
				writeln('For Player 2 (',user.data[log_id2].name,'), set the question for Player 1!');
				write('Question : ');readln(soal[1]);
				soal[1]:=upcase(soal[1]);
				if showclue then begin
					write('Clue : ');
					readln(clue[1]);
					clue[1]:=upcase(clue[1]);
				end;
			until yesno('Are you sure?');
			
			clrscr;
		end;
	begin
		{gameplay 2 player mode}
		{by: 16511323 Faiz Ilham Muhammad}
		start := sel_player2();
		
		if start then begin
			game_start;
			
			for i:=1 to 2 do begin  //ulangi untuk player1 dan 2
				clrscr;
				cursoron;
				search:=soal[i];
				gantikata(search, jawab, remain);
				salah:=0;
				used:='';
				write('Player ',i,' (');
				if i=1 then writeln(user.data[log_id].name,') turn') //jika giliran player 1
				else writeln(user.data[log_id2].name,') turn');		//jika giliran player 2
				
				
				repeat
					gambar_hangman(salah);
					gotoxy(1,15); writeln(' ':80); //hapus baris input char
					gotoxy(1,11);
					
					for j:=1 to length(jawab) do
						if showspace or (jawab[j] in ['_', 'A'..'Z', 'a'..'z']) then write(jawab[j],' ');
						
					writeln;
					
					if showclue then writeln('clue: ',clue[i]);
					
					if showused then begin
						write('used letter: ');
						
						if length(used)=0 then writeln('-')
						else writeln(used);
					end;
					writeln;
					
					if showused then begin
						//jika huruf yg dipakai ditampilkan
						repeat
							gotoxy(1,15);
							readln(inputs);
							gotoxy(1,16); writeln(' ':80); gotoxy(1,16);  //hapus baris peringatan
							
							if length(inputs)=1 then begin
								c:=upcase(inputs[1]);
								if not (c in ['a'..'z','A'..'Z']) then writeln('Please input letter only!')
								else if (pos(c, used) <> 0) then writeln('You have use letter ',c,'!');
							end else begin
								c:=#0;
								writeln('Please input 1 character!');
							end;
							gotoxy(1,15); writeln(' ':80); //hapus baris input char
						until (c in ['a'..'z','A'..'Z']) and (pos(c, used) = 0);
						
						if pos(c, used) = 0 then used:= used + c + ' ';
					end else begin
						//jika tidak
						repeat
							gotoxy(1,15);
							readln(inputs);
							gotoxy(1,16); writeln(' ':80); gotoxy(1,16);  //hapus baris peringatan
							
							if length(inputs)=1 then begin
								c:=upcase(inputs[1]);
								if not (c in ['a'..'z','A'..'Z']) then writeln('Please input letter only!');
							end else begin
								c:=#0;
								writeln('Please input 1 character!');
							end;
							gotoxy(1,15); writeln(' ':80); //hapus baris input char
						until (c in ['a'..'z','A'..'Z']);
					end;
					
					repeat
						k := pos(c, search);
						if k<>0 then begin
							jawab[k]:=c;	
							search[k]:=' '; //biar ga ketemu lagi
							remain:=remain - 1;
						end;
					until k = 0;
					
					if pos(c,soal[i])=0 then salah:=salah+1;
					
				until (salah = 8) or (remain = 0); //salah 8 atau huruf yang perlu ditebak sudah habis
				
				gotoxy(1,13);
				if showused then begin
					write('used letter: ');
					
					if length(used)=0 then writeln('-')
					else writeln(used);
				end;
					
					
				if salah = 8 then begin //jika salah 8
					gambar_hangman(8);
					gotoxy(1,16); writeln('Game Over! The solution is ', soal[i]);
					skor[i]:=0;
				end else begin //jika semua huruf tertebak
					gotoxy(1,11);
					for j:=1 to length(soal[i]) do 
						if showspace or (soal[i,j] in ['_', 'A'..'Z', 'a'..'z']) then write(soal[i,j],' ');
					writeln();
					
					gotoxy(1,16);
					skor[i]:= 100 - (salah*salah);
					writeln('Right! Your score is ', skor[i]);
				end;
				cursoroff;
				write('Press anykey to continue'); readkey;
			end;
			
			clrscr;
			writeln('Player 1 Score : ', skor[1]);
			writeln('Player 2 Score : ', skor[2]);
			writeln;
			
			inc(user.data[log_id].battle);
			inc(user.data[log_id2].battle);
			
			//membandingkan skor player 1 dan 2, lalu catat ke profil masing2
			if skor[1]>skor[2] then begin
				writeln('Player 1 (',user.data[log_id].name,') wins the battle!');
				inc(user.data[log_id].battlewin);
			end else if skor[1]<skor[2] then begin
				writeln('Player 2 (',user.data[log_id2].name,') wins the battle!');
				inc(user.data[log_id2].battlewin);
			end else
				writeln('Draw!');
				
			save_user();
			
			writeln;
			write('Press anykey to continue'); readkey;
		end;
	end;
	
	
	procedure info();
	{mencetak informasi user yg sedang ol berupa nama, skor tertinggi dan kata yang pernah ditebak
	IS: user ada yang sudah login (log_id<>0)
	FS: menampilkan data user
	by : 16511203 Muhamad Ihsan}
	var 
		i, n:integer;
	begin
		clrscr;
		writeln('Player Information');
		writeln;
		writeln('Username      : ', user.data[log_id].name);
		writeln('Highest score : ', user.data[log_id].score);
		writeln('Battle! mode win(s) : ', user.data[log_id].battlewin,' of ', user.data[log_id].battle);
		n:= user.data[log_id].n_tebak;
		
		if n = 0 then //belum pernah main
			writeln('No word had been guessed')
		else begin
			write('Total guessed word(s) : ', n);
			if n = kata.n then writeln(' (You have guessed all words!)')
			else writeln;
			
			writeln;
			for i:=1 to n do begin
				writeln('  ', kata.soal[user.data[log_id].tebak[i]]);
			end;
		end;
		writeln;
		write('Press anykey to go back to menu'); readkey;
	end;

	procedure help();
	//desc: bantuan tentang game
	//by : 16511059 Fransiskus Xaverius Christian
		procedure gbr_delay(strg:string);
		{desc: memberi delay pada penulisan 'how to play?'}
		{I.S.: }
		{F.S.: memberi delay pada karakter selain spasi
		by: 16511059 Fransiskus Xaverius Christian}
		var i:integer;
		begin
			for i:=1 to length(strg) do
			begin
				write(strg[i]);
				if(strg[i]<>' ') then
					delay(10);
			end;
			writeln();
		end;
	begin
		clrscr;
		gbr_delay(' ___                                                                       ___');
		gbr_delay('|   |   O   O OOOOO O     O  OOOOO OOOOO  OOOOO O       O   O   O   OOO   |   |');
		gbr_delay('|   O   O   O O   O O     O    O   O   O  O   O O      O O   O O   O   O  O   |');
		gbr_delay('|  /|\  OOOOO O   O O  O  O    O   O   O  OOOOO O     OOOOO   O       O  /|\  |');
		gbr_delay('|   |   O   O O   O  O O O     O   O   O  O     O     O   O   O      O    |   |');
		gbr_delay('|  / \  O   O OOOOO   O O      O   OOOOO  O     OOOOO O   O   O      O   / \  |');
		gbr_delay('|_____________________________________________________________________________|');
		writeln();writeln();
		writeln('1. Jika anda adalah pemain baru, klik "new player" untuk membuat akun baru pada');
		writeln('   game ini, tetapi jika anda pernah membuat akun pada game ini silahkan klik  ');
		writeln('   "select player" untuk memilih akun anda.');
		writeln('2. Setelah berhasil melakukan login,anda dapat bermain dengan mengklik "Play!".');
		writeln('3. Anda dapat melihat 10 pemain dengan skor terbaik pada menu,klik ''highscore''.');
		writeln('4. Anda dapat melihat tentang profil anda di "player info".');
		writeln();
		writeln('#RULES#');
		writeln('- Anda diminta untuk menebak kata sesuai dengan jumlah huruf yang disediakan.');
		writeln('- Anda diberi clue berupa "hint" tentang tema dari kata yang harus anda tebak.');
		writeln('- Anda harus menebak kata dengan menebak huruf-per-huruf dari kata yang harus ');
		writeln('  ditebak.');
		writeln('- Setiap kesalahan huruf yang anda tebak, menyebabkan avatar anda semakin ');
		writeln('  terancam untuk digantung. Jika kesalahan anda sampai 8x, maka avatar Anda');
		writeln('  akan tergantung dan anda kalah.');
		writeln('- Selamatkan avatarmu! Putar otakmu, gunakan imajinasimu! Mainkan logikamu, ');
		writeln('  kalahkan highscore lawanmu!');
		writeln();
		writeln('***************** HAVE FUN!!! THANKS FOR PLAYING THE GAME!!!******************');
		writeln;
		write('Press anykey to go back to menu'); readkey;
	end;

	procedure prog_init();
	{inisialisasi program
	I.S.: -
	F.S.: array user dan kata terdefinisi
	by : 16511203 Muhamad Ihsan}
	begin
		log_id:=0; //pada awalnya, belum ada user yg login
		quit:= false;
		load_kata; //load daftar kata
		load_user; //load data user
		item:=1; //menu yang pertama kali di-highlight --> 1
	end;

{----------------------------------------------------------------------program utama------------------------------------------------------------------------}
{by : 16511203 Muhamad Ihsan}
begin
	prog_init(); //inisialisasi awal program
	repeat
		item := menu(item);
		if log_id = 0 then //user belum login
			case item of
				1: new_player();
				2: sel_player();
				3: highscore(user);
				4: help();
				5: quit:=true;
			end
		else				//user sudah login
			case item of
				1: new_player();
				2: sel_player();
				3: gameplay();
				4: gameplay2();
				5: info();
				6: highscore(user);
				7: help();
				8: quit:=true;
			end;
	until quit; //user memilih keluar
	clrscr; cursoron;
end.